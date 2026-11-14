/**
 * T27 : relancer une partie dans la meme salle, contre une vraie base de test.
 *
 * Vu en vrai le 06/11 (salle 9SXZ6U) : la partie 777, relancee 3 s apres la
 * fin de la 776, a cree ses 10 manches puis n'a jamais bouge ; la salle et la
 * partie sont restees « in_progress » en base. Ce qui est verifie ici :
 * - une relance dans la seconde qui suit le game over part, et l'ecriture de
 *   fin de l'ancienne partie ne fait pas passer la salle « finie » ;
 * - une relance par-dessus une partie qui ne tourne plus la close en base ;
 * - un lancement qui casse apres la creation des manches ne laisse rien
 *   « in_progress » : salle en attente, partie close, et on peut relancer.
 *
 * Deezer n'est jamais appele (extraits simules, comme room-rounds-topup).
 * Base : TEST_DATABASE_URL (voir tests/testDatabase.ts), jamais la prod.
 */
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../src/utils/session", () => ({
  ...jest.requireActual("../../src/utils/session"),
  getSessionContext: jest.fn(),
}));
jest.mock("../../src/services/deezerPreviewService", () => {
  const lookup = async (title: string) =>
    title.includes("jouable") ? { preview: `https://extraits.test/${encodeURIComponent(title)}.mp3` } : null;
  return {
    deezerPreviewService: {
      searchTrack: lookup,
      resolvePreview: (query: { title: string }) => lookup(query.title),
      resolvePreviewOutcome: async (query: { title: string }, hooks?: { onStart?: () => void }) => {
        hooks?.onStart?.();
        const track = await lookup(query.title);
        return track ? { status: "found", track } : { status: "none" };
      },
    },
  };
});
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(async () => ({ data: {} })) } }));

import http from "http";
import crypto from "crypto";
import type { Request, Response } from "express";
import type { Server } from "socket.io";
import { resolveTestDatabaseUrl } from "../testDatabase";
import { pool } from "../../src/config/db";
import { initSocket } from "../../src/socket";
import { getSessionContext } from "../../src/utils/session";
import { ensureLinksSchema } from "../../src/controllers/linksController";
import { ensureUserTracksSchema, linkTrackToUser } from "../../src/services/userTracks";
import { roomsController } from "../../src/controllers/roomsController";
import { clearGame, getGameState } from "../../src/services/realtimeGame";
import * as orchestrator from "../../src/services/realtimeOrchestrator";

resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);
jest.setTimeout(30000);

const RUN = crypto.randomUUID().slice(0, 8);

type Envelope = { success: boolean; data: Record<string, unknown> | null; error: { code: string; message?: string } | null };
type Reply = { status: number; body: Envelope };

async function call(
  handler: (req: Request, res: Response) => Promise<void>,
  userId: number,
  req: { body?: unknown; params?: Record<string, string> } = {},
): Promise<Reply> {
  (getSessionContext as jest.Mock).mockResolvedValue({
    user: { id: userId, provider: "guest", provider_id: `invite-${userId}`, username: `joueur${userId}` },
    connection: null,
    sessionToken: null,
  });
  const reply: Reply = { status: 200, body: { success: false, data: null, error: null } };
  const res = {
    status(code: number) { reply.status = code; return res; },
    json(body: Envelope) { reply.body = body; return res; },
    setHeader() { return res; },
    cookie() { return res; },
    clearCookie() { return res; },
  };
  await handler({ body: req.body ?? {}, params: req.params ?? {}, query: {}, headers: {}, session: {} } as unknown as Request, res as unknown as Response);
  return reply;
}

async function newGuest(name: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (provider, provider_id, username) VALUES ('guest', $1, $2) RETURNING id`,
    [crypto.randomUUID(), `${name}_${RUN}`],
  );
  return rows[0].id;
}

let seq = 0;
async function giveLibrary(userId: number, total: number): Promise<void> {
  for (let i = 0; i < total; i++) {
    seq += 1;
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO audio_sources (provider, external_id, title, artist, audio_url, metadata)
       VALUES ('deezer', $1, $2, 'Artiste', NULL, '{}') RETURNING id`,
      [`relance-${RUN}-${seq}`, `Titre jouable relance ${RUN} ${seq}`],
    );
    await linkTrackToUser(userId, rows[0].id, null);
  }
}

const rooms: string[] = [];

async function newRoom(players: number[]): Promise<string> {
  const code = crypto.randomUUID().replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO multiplayer_rooms (room_code, host_user_id, status, max_players, question_count, mode)
     VALUES ($1, $2, 'waiting', 10, 3, 'friends') RETURNING id`,
    [code, players[0]],
  );
  for (const userId of players) {
    await pool.query(`INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2)`, [rows[0].id, userId]);
  }
  rooms.push(code);
  return code;
}

const start = (code: string, hostId: number) => call(roomsController.startGame, hostId, { params: { code } });

async function room(code: string): Promise<{ status: string; session_id: number | null }> {
  const { rows } = await pool.query(`SELECT status, session_id FROM multiplayer_rooms WHERE room_code = $1`, [code]);
  return rows[0];
}

async function sessionState(id: number): Promise<string> {
  const { rows } = await pool.query<{ state: string }>(`SELECT state FROM game_sessions WHERE id = $1`, [id]);
  return rows[0]?.state;
}

/** Joue la partie jusqu'au game over, comme le font les minuteurs. */
function playToTheEnd(io: Server, code: string): void {
  for (let guard = 0; guard < 10 && getGameState(code)?.phase !== "FINISHED"; guard++) {
    orchestrator.revealRoundNow(io, code);
    orchestrator.startRoundAndBroadcast(io, code);
  }
  expect(getGameState(code)?.phase).toBe("FINISHED");
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let io: Server;
let hote: number;
let invite: number;

beforeAll(async () => {
  io = initSocket(http.createServer(), ["*"]);
  await ensureLinksSchema();
  await ensureUserTracksSchema();
  hote = await newGuest("relance_hote");
  invite = await newGuest("relance_invite");
  await giveLibrary(hote, 30);
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const code of rooms.splice(0)) {
    orchestrator.clearRevealTimer(code);
    orchestrator.clearPacingTimer(code);
    orchestrator.clearGraceTimer(code);
    clearGame(code);
  }
});

afterAll(async () => {
  await pool.end();
});

describe("relancer dans la meme salle (T27)", () => {
  it("juste apres le game over : la revanche part et la salle reste « en cours »", async () => {
    const code = await newRoom([hote, invite]);
    expect((await start(code, hote)).status).toBe(200);
    const first = (await room(code)).session_id!;
    playToTheEnd(io, code);

    // Relance immediate, pendant que la fin de la premiere s'ecrit en base.
    const relaunch = await start(code, hote);
    expect(relaunch.status).toBe(200);
    const state = getGameState(code);
    expect(state?.phase).toBe("GUESSING");
    expect(state?.currentRound).toBe(1);
    expect(state?.timing.revealAt).toBeTruthy();

    await sleep(500); // l'ecriture de fin de la premiere partie est passee
    const after = await room(code);
    expect(after.status).toBe("in_progress");
    expect(after.session_id).not.toBe(first);
    expect(await sessionState(first)).toBe("finished");
    expect(await sessionState(after.session_id!)).toBe("in_progress");
  });

  it("par-dessus une partie qui ne tourne plus : elle est close en base", async () => {
    const code = await newRoom([hote, invite]);
    expect((await start(code, hote)).status).toBe(200);
    const stuck = (await room(code)).session_id!;
    // La partie disparait de la memoire (redemarrage, plantage) : la base
    // dit encore « in_progress ».
    orchestrator.clearRevealTimer(code);
    clearGame(code);

    const relaunch = await start(code, hote);
    expect(relaunch.status).toBe(200);
    expect(await sessionState(stuck)).toBe("abandoned");
    expect((await room(code)).session_id).not.toBe(stuck);
  });

  it("un lancement qui casse apres la creation des manches ne laisse rien « en cours »", async () => {
    const code = await newRoom([hote, invite]);
    jest.spyOn(orchestrator, "startRoundAndBroadcast").mockImplementationOnce(() => {
      throw new Error("panne simulee");
    });

    const failed = await start(code, hote);
    expect(failed.status).toBe(500);
    expect(failed.body.error?.code).toBe("start_failed");
    const { rows } = await pool.query<{ id: number; state: string }>(
      `SELECT id, state FROM game_sessions WHERE room_code = $1`,
      [code],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("abandoned");
    expect(await room(code)).toEqual({ status: "waiting", session_id: null });
    expect(getGameState(code)).toBeUndefined();

    // L'hote relance sans recreer de salle.
    const retry = await start(code, hote);
    expect(retry.status).toBe(200);
    expect(getGameState(code)?.phase).toBe("GUESSING");
    expect((await room(code)).status).toBe("in_progress");
  });
});

describe("revenir a la salle apres une partie (T40)", () => {
  const backToLobby = (code: string, userId: number) => call(roomsController.backToLobby, userId, { params: { code } });

  it("fin, retour salle, relance : meme code, memes joueurs, reglages gardes", async () => {
    const code = await newRoom([hote, invite]);
    expect((await start(code, hote)).status).toBe(200);
    const first = (await room(code)).session_id!;
    playToTheEnd(io, code);
    await sleep(300); // l'ecriture de fin de partie est passee

    const emit = jest.fn();
    jest.spyOn(io, "to").mockReturnValue({ emit } as unknown as ReturnType<Server["to"]>);
    const back = await backToLobby(code, hote);
    expect(back.status).toBe(200);
    expect(emit).toHaveBeenCalledWith("room:lobby", { roomCode: code });
    jest.restoreAllMocks();

    expect(await room(code)).toEqual({ status: "waiting", session_id: null });
    expect(getGameState(code)).toBeUndefined();
    expect(await sessionState(first)).toBe("finished");
    const { rows } = await pool.query(
      `SELECT r.question_count, r.completed_at > NOW() - INTERVAL '1 minute' AS recent,
              (SELECT count(*)::int FROM room_participants p WHERE p.room_id = r.id) AS players
       FROM multiplayer_rooms r WHERE r.room_code = $1`,
      [code],
    );
    // completed_at recent : le menage des salles en attente la laisse tranquille.
    expect(rows[0]).toEqual({ question_count: 3, recent: true, players: 2 });

    // Un deuxieme clic ne casse rien.
    expect((await backToLobby(code, hote)).status).toBe(200);

    const relaunch = await start(code, hote);
    expect(relaunch.status).toBe(200);
    expect(getGameState(code)?.phase).toBe("GUESSING");
    expect((await room(code)).status).toBe("in_progress");
  });

  it("seul l'hote ramene tout le monde, et jamais pendant une partie", async () => {
    const code = await newRoom([hote, invite]);
    expect((await start(code, hote)).status).toBe(200);
    expect((await backToLobby(code, hote)).status).toBe(409);
    playToTheEnd(io, code);
    expect((await backToLobby(code, invite)).status).toBe(403);
    expect(getGameState(code)?.phase).toBe("FINISHED");
  });
});
