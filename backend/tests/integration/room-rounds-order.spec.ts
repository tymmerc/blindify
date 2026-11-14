/**
 * T37 : l'ordre et le choix des manches d'une salle, contre une vraie base de test.
 *
 * Vu en vrai le 12/11/2026 (soiree a 8, parties 817 a 823) :
 * - 2 a 4 manches par partie venaient du meme joueur que la manche d'avant :
 *   le tourniquet etait re-melange au hasard juste apres ;
 * - 18 morceaux sont passes dans 2 ou 3 parties de la meme soiree : les
 *   parties multijoueur ne regardaient pas ce qui avait deja ete joue (la
 *   table used_tracks ne sert qu'au solo), et chaque relance avait une
 *   nouvelle salle.
 *
 * Ce qui est verifie :
 * - jamais deux manches de suite du meme joueur, a 7 joueurs comme a 2 ;
 * - un joueur qui a beaucoup plus de morceaux : les manches de suite
 *   n'arrivent qu'une fois les autres a court ;
 * - une partie suivante avec les memes joueurs (autre salle) ne rejoue pas
 *   un morceau de la soiree tant qu'il en reste de jamais joues ;
 * - quand tout a deja ete joue, les morceaux reviennent plutot que de
 *   raccourcir la partie.
 *
 * Deezer n'est jamais appele : chaque morceau a deja un extrait en cache.
 * Base : TEST_DATABASE_URL (voir tests/testDatabase.ts), jamais la prod.
 */
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../src/utils/session", () => ({
  ...jest.requireActual("../../src/utils/session"),
  getSessionContext: jest.fn(),
}));
jest.mock("../../src/services/deezerPreviewService", () => ({
  deezerPreviewService: {
    searchTrack: async () => null,
    resolvePreview: async () => null,
    resolvePreviewOutcome: async () => ({ status: "none" }),
  },
}));
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(async () => ({ data: {} })) } }));

import http from "http";
import crypto from "crypto";
import type { Request, Response } from "express";
import { resolveTestDatabaseUrl } from "../testDatabase";
import { pool } from "../../src/config/db";
import { initSocket } from "../../src/socket";
import { getSessionContext } from "../../src/utils/session";
import { ensureLinksSchema } from "../../src/controllers/linksController";
import { ensureUserTracksSchema, linkTrackToUser } from "../../src/services/userTracks";
import { roomsController } from "../../src/controllers/roomsController";
import { clearGame } from "../../src/services/realtimeGame";
import { clearPacingTimer, clearRevealTimer } from "../../src/services/realtimeOrchestrator";

resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);
jest.setTimeout(60000);

const RUN = crypto.randomUUID().slice(0, 8);
let seq = 0;

async function newGuest(name: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (provider, provider_id, username) VALUES ('guest', $1, $2) RETURNING id`,
    [crypto.randomUUID(), `${name}_${RUN}`],
  );
  return rows[0].id;
}

/** `count` morceaux jouables (extrait deja en cache), relies au joueur. */
async function giveLibrary(userId: number, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    seq += 1;
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO audio_sources (provider, external_id, title, artist, audio_url)
       VALUES ('deezer', $1, $2, 'Artiste', $3) RETURNING id`,
      [`${RUN}-ordre-${seq}`, `Titre ${RUN} ${seq}`, `https://extraits.test/${RUN}-${seq}.mp3`],
    );
    await linkTrackToUser(userId, rows[0].id, null);
  }
}

const started: string[] = [];

/** Une salle neuve avec ces joueurs (le premier est l'hote), lancee. Rend ses manches dans l'ordre. */
async function playRoom(players: number[], questionCount: number, mode = "friends"): Promise<Array<{ key: string; owner: number }>> {
  const code = crypto.randomUUID().replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO multiplayer_rooms (room_code, host_user_id, status, max_players, question_count, mode)
     VALUES ($1, $2, 'waiting', 10, $3, $4) RETURNING id`,
    [code, players[0], questionCount, mode],
  );
  for (const userId of players) {
    await pool.query(`INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2)`, [rows[0].id, userId]);
  }
  (getSessionContext as jest.Mock).mockResolvedValue({
    user: { id: players[0], provider: "guest", provider_id: `invite-${players[0]}`, username: `hote${players[0]}` },
    connection: null,
    sessionToken: null,
  });
  let status = 200;
  const res = {
    status(c: number) { status = c; return res; },
    json() { return res; },
    setHeader() { return res; },
    cookie() { return res; },
    clearCookie() { return res; },
  };
  await roomsController.startGame(
    { body: { source: "library" }, params: { code }, query: {}, headers: {}, session: {} } as unknown as Request,
    res as unknown as Response,
  );
  started.push(code);
  expect(status).toBe(200);
  const { rows: rounds } = await pool.query<{ key: string; owner: number }>(
    `SELECT a.external_id AS key, gr.owner_user_id AS owner
     FROM multiplayer_rooms m
     JOIN game_rounds gr ON gr.session_id = m.session_id
     JOIN audio_sources a ON a.id = gr.audio_source_id
     WHERE m.room_code = $1
     ORDER BY gr.round_index`,
    [code],
  );
  return rounds;
}

/** Combien de fois une manche vient du meme joueur que la precedente. */
const repeats = (rounds: Array<{ owner: number }>): number =>
  rounds.filter((r, i) => i > 0 && r.owner === rounds[i - 1].owner).length;

let httpServer: http.Server;

beforeAll(async () => {
  httpServer = http.createServer();
  initSocket(httpServer, ["*"]);
  await ensureLinksSchema();
  await ensureUserTracksSchema();
});

afterEach(() => {
  for (const code of started.splice(0)) {
    clearRevealTimer(code);
    clearPacingTimer(code);
    clearGame(code);
  }
});

afterAll(async () => {
  httpServer.close();
  await pool.end();
});

describe("jamais deux manches de suite du meme joueur", () => {
  it("7 joueurs, 20 manches, 5 parties : aucune manche ne suit une manche du meme joueur", async () => {
    const players: number[] = [];
    for (let i = 0; i < 7; i++) players.push(await newGuest(`sept${i}`));
    for (const p of players) await giveLibrary(p, 60);
    for (let game = 0; game < 5; game++) {
      const rounds = await playRoom(players, 20, "event");
      expect(rounds).toHaveLength(20);
      expect(repeats(rounds)).toBe(0);
    }
  });

  it("2 joueurs : les manches alternent", async () => {
    const a = await newGuest("duo_a");
    const b = await newGuest("duo_b");
    await giveLibrary(a, 30);
    await giveLibrary(b, 30);
    for (let game = 0; game < 3; game++) {
      const rounds = await playRoom([a, b], 10);
      expect(rounds).toHaveLength(10);
      expect(repeats(rounds)).toBe(0);
    }
  });

  it("un joueur a beaucoup plus de morceaux : les manches de suite n'arrivent qu'une fois l'autre a court", async () => {
    const riche = await newGuest("riche");
    const court = await newGuest("court");
    await giveLibrary(riche, 30);
    await giveLibrary(court, 3);
    const rounds = await playRoom([riche, court], 10);
    expect(rounds).toHaveLength(10);
    const fromCourt = rounds.filter(r => r.owner === court).length;
    expect(fromCourt).toBe(3);
    // 7 manches du premier, 3 du second : au mieux 7 - 3 - 1 = 3 manches de suite.
    expect(repeats(rounds)).toBe(3);
    const lastCourt = rounds.map(r => r.owner).lastIndexOf(court);
    expect(repeats(rounds.slice(0, lastCourt + 1))).toBe(0);
  });
});

describe("les morceaux de la soiree ne reviennent pas", () => {
  it("3 parties de suite avec les memes joueurs, chaque fois dans une nouvelle salle : aucun morceau rejoue", async () => {
    const players = [await newGuest("soir_a"), await newGuest("soir_b"), await newGuest("soir_c")];
    for (const p of players) await giveLibrary(p, 25);
    const heard = new Set<string>();
    for (let game = 0; game < 3; game++) {
      const rounds = await playRoom(players, 20, "event");
      expect(rounds).toHaveLength(20);
      for (const r of rounds) {
        expect(heard.has(r.key)).toBe(false);
        heard.add(r.key);
      }
    }
  });

  it("un joueur de la partie d'avant suffit : ses morceaux deja joues ne reviennent pas", async () => {
    const a = await newGuest("suite_a");
    const b = await newGuest("suite_b");
    const c = await newGuest("suite_c");
    await giveLibrary(a, 20);
    await giveLibrary(b, 20);
    await giveLibrary(c, 20);
    const first = new Set((await playRoom([a, b], 10)).map(r => r.key));
    // B change de table : la partie suivante est entre C et A.
    const second = await playRoom([c, a], 10);
    expect(second.some(r => first.has(r.key))).toBe(false);
  });

  it("quand tout a deja ete joue, les morceaux reviennent plutot que de raccourcir la partie", async () => {
    const a = await newGuest("peu_a");
    const b = await newGuest("peu_b");
    await giveLibrary(a, 8);
    await giveLibrary(b, 8);
    expect(await playRoom([a, b], 16)).toHaveLength(16);
    expect(await playRoom([a, b], 16)).toHaveLength(16);
  });
});
