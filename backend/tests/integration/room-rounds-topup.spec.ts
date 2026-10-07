/**
 * Nombre de manches au lancement d'une salle, contre une vraie base de test.
 *
 * Le defaut corrige (vu en prod le 07/10/2026, salle 3Y9YRK) : 20 manches
 * demandees, 16 jouees. Tymeo avait 50 titres, kaaris aucun ; des titres sans
 * extrait Deezer etaient ecartes et personne ne le disait.
 *
 * Ce qui est verifie :
 * - 20 demandees, 50 titres dont 30 jouables : 20 manches ;
 * - 50 titres dont 12 jouables : 12 manches, et la partie sait que 20 etaient
 *   demandees (l'ecran le dit) ;
 * - une bibliotheque clairsemee est completee jusqu'au bout ;
 * - deux joueurs : le tourniquet reste equitable, le plus fourni complete ;
 * - une grosse bibliotheque injouable : chaque titre est cherche au plus une
 *   fois chez Deezer, le lancement reste sous LOOKUPS_PER_ROUND par manche et
 *   jamais plus de HYDRATE_CONCURRENCY recherches partent en meme temps ;
 * - la reponse du lancement reste caviardee (les manches se lisent en base) ;
 * - Deezer qui ne repond pas : le lancement s'arrete a l'echeance, ou des que
 *   6 recherches de suite echouent, et la salle reste relancable ; la partie
 *   courte dit alors que c'est Deezer, pas les playlists ;
 * - deux lancements en meme temps : une seule partie ;
 * - le complement respecte la playlist choisie par le joueur ;
 * - un tirage s'arrete de chercher des qu'il a son compte ;
 * - solo : un extrait en cache expire est re-cherche, jamais servi.
 *
 * Deezer n'est jamais appele : les extraits sont simules (un titre qui
 * contient « jouable » en a un, les autres non).
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
  // Une recherche par titre : compte les appels, trouve un extrait si le titre
  // contient « jouable ». Branche aussi sur resolvePreview (recherche par ISRC).
  // Elle dure quelques ms : on mesure combien partent en meme temps.
  // hangIf : les titres pour lesquels Deezer ne repond jamais.
  const inFlight = { now: 0, peak: 0, hangIf: null as null | ((title: string) => boolean) };
  const lookup = jest.fn(async (title: string) => {
    if (inFlight.hangIf?.(title)) return new Promise(() => {});
    inFlight.now += 1;
    inFlight.peak = Math.max(inFlight.peak, inFlight.now);
    await new Promise(resolve => setTimeout(resolve, 3));
    inFlight.now -= 1;
    return title.includes("jouable") ? { preview: `https://extraits.test/${encodeURIComponent(title)}.mp3` } : null;
  });
  return {
    inFlight,
    deezerPreviewService: {
      searchTrack: lookup,
      resolvePreview: (query: { title: string }) => lookup(query.title),
    },
  };
});
// Le solo complete parfois avec le top iTunes : jamais d'appel reseau en test.
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
import { gamesController } from "../../src/controllers/gamesController";
import { clearGame } from "../../src/services/realtimeGame";
import { clearAdvanceTimer, clearRevealTimer } from "../../src/services/realtimeOrchestrator";
import { LOOKUPS_PER_ROUND, START_LIMITS } from "../../src/services/lookupGuard";
import { HYDRATE_CONCURRENCY, collectPlayableBatch } from "../../src/services/trackResolution";
import * as deezerModule from "../../src/services/deezerPreviewService";

// La recherche simulee (searchTrack et resolvePreview passent par elle).
const lookup = deezerModule.deezerPreviewService.searchTrack as unknown as jest.Mock;
const inFlight = (deezerModule as unknown as {
  inFlight: { now: number; peak: number; hangIf: null | ((title: string) => boolean) };
}).inFlight;
const DEFAULT_LIMITS = { ...START_LIMITS };

resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);

jest.setTimeout(30000);

const RUN = crypto.randomUUID().slice(0, 8);

// ---- appels de controleurs ---------------------------------------------------

type Envelope = { success: boolean; data: Record<string, unknown> | null; error: { code: string; details?: Record<string, unknown> } | null };
type Reply = { status: number; body: Envelope };

const field = <T>(reply: Reply, key: string): T => reply.body.data?.[key] as T;

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

/**
 * Donne `total` titres a un joueur, dont `playable` ont un extrait chez Deezer.
 * `audioUrl` : extrait deja en cache (par defaut aucun, comme apres un import).
 */
async function giveLibrary(
  userId: number,
  total: number,
  playable: number,
  audioUrl: string | null = null,
  opts: { mute?: string; playlistId?: string } = {},
): Promise<string[]> {
  const titles: string[] = [];
  for (let i = 0; i < total; i++) {
    seq += 1;
    const title = i < playable ? `Titre jouable ${RUN} ${seq}` : `Titre ${opts.mute ?? "muet"} ${RUN} ${seq}`;
    const metadata = opts.playlistId ? { playlist_id: opts.playlistId } : {};
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO audio_sources (provider, external_id, title, artist, audio_url, metadata) VALUES ('deezer', $1, $2, 'Artiste', $3, $4) RETURNING id`,
      [`${RUN}-${seq}`, title, audioUrl, metadata],
    );
    await linkTrackToUser(userId, rows[0].id, null);
    titles.push(title);
  }
  return titles;
}

const startedRooms: string[] = [];

async function newRoom(players: number[], questionCount: number): Promise<string> {
  const code = crypto.randomUUID().replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO multiplayer_rooms (room_code, host_user_id, status, max_players, question_count, mode)
     VALUES ($1, $2, 'waiting', 10, $3, 'friends') RETURNING id`,
    [code, players[0], questionCount],
  );
  for (const userId of players) {
    await pool.query(`INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2)`, [rows[0].id, userId]);
  }
  return code;
}

/** Une manche telle que la base la garde (la reponse du lancement est caviardee). */
type Round = { title: string; owner: number | null; playlistId: string | null };

type Started = Reply & {
  /** Les manches lues en base. */
  tracks: Round[];
  /** Les manches telles que la reponse HTTP les donne a l'hote. */
  publicTracks: Array<{ title: string | null; artist: string | null; audio_url: string | null; metadata: { owner_user_id?: number | null } }>;
  session: { totalRounds: number; requestedRounds?: number; shortReason?: string | null };
  gameState: { totalRounds: number; requestedRounds?: number; shortReason?: string | null };
};

async function roundsOf(code: string): Promise<Round[]> {
  const { rows } = await pool.query<{ title: string; owner: number | null; playlist_id: string | null }>(
    `SELECT a.title, gr.owner_user_id AS owner, a.metadata->>'playlist_id' AS playlist_id
     FROM multiplayer_rooms m
     JOIN game_rounds gr ON gr.session_id = m.session_id
     JOIN audio_sources a ON a.id = gr.audio_source_id
     WHERE m.room_code = $1
     ORDER BY gr.round_index`,
    [code],
  );
  return rows.map(r => ({ title: r.title, owner: r.owner, playlistId: r.playlist_id }));
}

async function startRoom(code: string, hostId: number): Promise<Started> {
  const reply = await call(roomsController.startGame, hostId, { params: { code }, body: { source: "library" } });
  startedRooms.push(code);
  return {
    ...reply,
    tracks: reply.status === 200 ? await roundsOf(code) : [],
    publicTracks: field<Started["publicTracks"] | undefined>(reply, "tracks") ?? [],
    session: field<Started["session"]>(reply, "session"),
    gameState: field<Started["gameState"]>(reply, "gameState"),
  };
}

async function roomStatus(code: string): Promise<string> {
  const { rows } = await pool.query<{ status: string }>(`SELECT status FROM multiplayer_rooms WHERE room_code = $1`, [code]);
  return rows[0]?.status;
}

function stopGame(code: string): void {
  clearRevealTimer(code);
  clearAdvanceTimer(code);
  clearGame(code);
}

function countByOwner(tracks: Started["tracks"]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const t of tracks) {
    const owner = Number(t.owner);
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return counts;
}

/** Recherches Deezer faites pendant `run`, titre par titre. */
async function lookupsDuring(run: () => Promise<void>): Promise<Map<string, number>> {
  lookup.mockClear();
  inFlight.peak = 0;
  await run();
  const counts = new Map<string, number>();
  for (const [title] of lookup.mock.calls as Array<[string]>) counts.set(title, (counts.get(title) ?? 0) + 1);
  return counts;
}

let httpServer: http.Server;

beforeAll(async () => {
  httpServer = http.createServer();
  initSocket(httpServer, ["*"]);
  await ensureLinksSchema();
  await ensureUserTracksSchema();
});

afterEach(() => {
  for (const code of startedRooms.splice(0)) stopGame(code);
  Object.assign(START_LIMITS, DEFAULT_LIMITS);
  inFlight.hangIf = null;
  inFlight.now = 0;
});

afterAll(async () => {
  httpServer.close();
  await pool.end();
});

describe("lancement d'une salle : autant de manches que demande", () => {
  it("20 demandees, 50 titres dont 30 jouables chez l'hote, l'invite sans musique : 20 manches", async () => {
    const tymeo = await newGuest("tymeo");
    const kaaris = await newGuest("kaaris");
    await giveLibrary(tymeo, 50, 30);

    const code = await newRoom([tymeo, kaaris], 20);
    const started = await startRoom(code, tymeo);

    expect(started.status).toBe(200);
    expect(started.tracks).toHaveLength(20);
    expect(started.tracks.every(t => t.title.includes("jouable"))).toBe(true);
    expect(started.session.totalRounds).toBe(20);
    expect(started.session.requestedRounds).toBe(20);
    expect(started.gameState.requestedRounds).toBe(20);
    expect(started.session.shortReason ?? null).toBeNull();
  });

  it("la reponse du lancement reste caviardee : seul le nombre de manches demande s'y ajoute", async () => {
    const hote = await newGuest("caviarde");
    const invite = await newGuest("invite_caviarde");
    await giveLibrary(hote, 30, 12);

    const code = await newRoom([hote, invite], 20);
    const started = await startRoom(code, hote);

    expect(started.status).toBe(200);
    expect(started.publicTracks).toHaveLength(12);
    for (const t of started.publicTracks) {
      expect([t.title, t.artist, t.audio_url, t.metadata.owner_user_id ?? null]).toEqual([null, null, null, null]);
    }
    expect(started.session.requestedRounds).toBe(20);
    expect(started.session.shortReason).toBe("library");
    expect(JSON.stringify(started.body)).not.toContain("Titre jouable");
  });

  it("50 titres dont 12 jouables : 12 manches, et la partie sait que 20 etaient demandees", async () => {
    const hote = await newGuest("hote12");
    const invite = await newGuest("invite12");
    await giveLibrary(hote, 50, 12);

    const code = await newRoom([hote, invite], 20);
    const started = await startRoom(code, hote);

    expect(started.status).toBe(200);
    expect(started.tracks).toHaveLength(12);
    expect(started.session.totalRounds).toBe(12);
    expect(started.session.requestedRounds).toBe(20);
    expect(started.gameState.totalRounds).toBe(12);
    expect(started.gameState.requestedRounds).toBe(20);
    // Les playlists n'avaient pas assez de titres : c'est bien elles qu'on cite.
    expect(started.session.shortReason).toBe("library");
    expect(started.gameState.shortReason).toBe("library");
  });

  it("une bibliotheque clairsemee (10 jouables sur 40) est completee jusqu'au dernier titre jouable", async () => {
    const hote = await newGuest("clairseme");
    const invite = await newGuest("invite_clairseme");
    await giveLibrary(hote, 40, 10);

    // Plusieurs parties : le tirage est aleatoire, le resultat ne doit pas l'etre.
    for (let partie = 0; partie < 5; partie++) {
      const code = await newRoom([hote, invite], 10);
      const started = await startRoom(code, hote);
      expect(started.status).toBe(200);
      expect(started.tracks).toHaveLength(10);
      stopGame(code);
    }
  });

  it("deux joueurs : le tourniquet reste equitable, et le plus fourni complete quand l'autre est a sec", async () => {
    const ana = await newGuest("ana");
    const ben = await newGuest("ben");
    await giveLibrary(ana, 30, 12);
    await giveLibrary(ben, 30, 30);

    const code = await newRoom([ana, ben], 20);
    const started = await startRoom(code, ana);
    expect(started.tracks).toHaveLength(20);
    const counts = countByOwner(started.tracks);
    expect([counts.get(ana), counts.get(ben)]).toEqual([10, 10]);
    stopGame(code);

    const cleo = await newGuest("cleo");
    const dan = await newGuest("dan");
    await giveLibrary(cleo, 30, 6);
    await giveLibrary(dan, 30, 30);
    const code2 = await newRoom([cleo, dan], 20);
    const started2 = await startRoom(code2, cleo);
    expect(started2.tracks).toHaveLength(20);
    const counts2 = countByOwner(started2.tracks);
    expect([counts2.get(cleo), counts2.get(dan)]).toEqual([6, 14]);
  });

  it("une grosse bibliotheque injouable : chaque titre cherche une fois au plus, et le lancement reste borne", async () => {
    const hote = await newGuest("injouable");
    const invite = await newGuest("invite_injouable");
    await giveLibrary(hote, 300, 0);

    const code = await newRoom([hote, invite], 20);
    let started: Started | undefined;
    const lookups = await lookupsDuring(async () => {
      started = await startRoom(code, hote);
    });

    expect(started?.status).toBe(400);
    expect(started?.body.error?.code).toBe("insufficient_tracks");
    expect(Math.max(0, ...lookups.values())).toBeLessThanOrEqual(1);
    const total = [...lookups.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(20 * LOOKUPS_PER_ROUND);
  });

  it("une bibliotheque presque injouable (30 sur 300) : le complement reste borne lui aussi", async () => {
    const hote = await newGuest("presque");
    const invite = await newGuest("invite_presque");
    await giveLibrary(hote, 300, 30);

    const code = await newRoom([hote, invite], 20);
    let started: Started | undefined;
    const lookups = await lookupsDuring(async () => {
      started = await startRoom(code, hote);
    });

    expect(started?.status).toBe(200);
    expect(started?.session.requestedRounds).toBe(20);
    expect(Math.max(0, ...lookups.values())).toBeLessThanOrEqual(1);
    const total = [...lookups.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(20 * LOOKUPS_PER_ROUND);
    // Jamais de rafale chez Deezer : 6 recherches en meme temps au plus.
    expect(inFlight.peak).toBeGreaterThan(1);
    expect(inFlight.peak).toBeLessThanOrEqual(HYDRATE_CONCURRENCY);
  });
});

describe("Deezer lent ou muet : le lancement reste borne", () => {
  it("Deezer ne repond jamais : le lancement s'arrete a l'echeance et la salle reste relancable", async () => {
    Object.assign(START_LIMITS, { deadlineMs: 800, lookupTimeoutMs: 5_000, breakerFailures: 1_000 });
    inFlight.hangIf = () => true;
    const hote = await newGuest("muet");
    const invite = await newGuest("invite_muet");
    await giveLibrary(hote, 40, 40);
    const code = await newRoom([hote, invite], 10);

    const t0 = Date.now();
    const first = await startRoom(code, hote);
    expect(Date.now() - t0).toBeLessThan(2_500);
    expect(first.status).toBe(400);
    expect(first.body.error?.code).toBe("insufficient_tracks");
    expect(first.body.error?.details?.reason).toBe("lookup");
    expect(await roomStatus(code)).toBe("waiting");

    // Deezer revient : la meme salle part.
    inFlight.hangIf = null;
    const second = await startRoom(code, hote);
    expect(second.status).toBe(200);
    expect(second.tracks).toHaveLength(10);
  });

  it("6 recherches de suite sans reponse : le lancement arrete de chercher", async () => {
    Object.assign(START_LIMITS, { deadlineMs: 20_000, lookupTimeoutMs: 200, breakerFailures: 6 });
    inFlight.hangIf = () => true;
    const hote = await newGuest("disjoncte");
    const invite = await newGuest("invite_disjoncte");
    await giveLibrary(hote, 100, 100);
    const code = await newRoom([hote, invite], 20);

    const t0 = Date.now();
    let started: Started | undefined;
    const lookups = await lookupsDuring(async () => {
      started = await startRoom(code, hote);
    });

    expect(started?.status).toBe(400);
    expect(Date.now() - t0).toBeLessThan(3_000);
    const total = [...lookups.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(2 * HYDRATE_CONCURRENCY);
    expect(await roomStatus(code)).toBe("waiting");
  });

  it("des titres sans reponse de Deezer : la partie courte cite Deezer, pas les playlists", async () => {
    Object.assign(START_LIMITS, { deadlineMs: 20_000, lookupTimeoutMs: 200, breakerFailures: 6 });
    inFlight.hangIf = title => title.includes("lent");
    const hote = await newGuest("lent");
    const invite = await newGuest("invite_lent");
    await giveLibrary(hote, 50, 12, null, { mute: "lent" });
    const code = await newRoom([hote, invite], 20);

    const started = await startRoom(code, hote);

    expect(started.status).toBe(200);
    expect(started.session.totalRounds).toBeLessThan(20);
    expect(started.session.shortReason).toBe("lookup");
    expect(started.gameState.shortReason).toBe("lookup");
  });
});

describe("verrou du lancement", () => {
  it("deux lancements en meme temps (double clic, deux onglets) : une seule partie", async () => {
    const hote = await newGuest("double");
    const invite = await newGuest("invite_double");
    await giveLibrary(hote, 40, 40);
    const code = await newRoom([hote, invite], 10);

    const replies = await Promise.all([startRoom(code, hote), startRoom(code, hote)]);

    const { rows } = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM game_sessions WHERE room_code = $1`, [code]);
    expect(Number(rows[0].n)).toBe(1);
    expect(replies.some(r => r.status === 200)).toBe(true);
    expect(replies.every(r => r.status === 200 || r.status === 409)).toBe(true);
  });
});

describe("le complement suit les choix du joueur", () => {
  it("un joueur qui a choisi une playlist ne joue que des titres de cette playlist", async () => {
    const hote = await newGuest("hote_pref");
    const spot = await newGuest("spot");
    await giveLibrary(hote, 30, 12);
    await giveLibrary(spot, 30, 5, null, { playlistId: "PLX" });
    await giveLibrary(spot, 30, 30, null, { playlistId: "AUTRE" });
    await pool.query(
      `INSERT INTO user_connections (user_id, provider, access_token) VALUES ($1, 'spotify', 'jeton-de-test')`,
      [spot],
    );
    const code = await newRoom([hote, spot], 20);
    await pool.query(
      `UPDATE room_participants SET source_pref = 'playlist', playlist_pref = 'PLX'
       WHERE user_id = $1 AND room_id = (SELECT id FROM multiplayer_rooms WHERE room_code = $2)`,
      [spot, code],
    );

    const started = await startRoom(code, hote);

    expect(started.status).toBe(200);
    const fromSpot = started.tracks.filter(t => t.owner === spot);
    expect(fromSpot.length).toBeGreaterThan(0);
    expect(fromSpot.every(t => t.playlistId === "PLX")).toBe(true);
    // 12 de l'hote, 5 de la playlist choisie : la partie est plus courte, et le dit.
    expect(started.tracks).toHaveLength(17);
    expect(started.session.shortReason).toBe("library");
  });
});

describe("tirage", () => {
  it("s'arrete de chercher des qu'il a son compte", async () => {
    const joueur = await newGuest("compte");
    await giveLibrary(joueur, 40, 40);

    let batch: Awaited<ReturnType<typeof collectPlayableBatch>> | undefined;
    const lookups = await lookupsDuring(async () => {
      batch = await collectPlayableBatch(joueur, 5, { provider: "any" });
    });

    expect(batch?.playable).toHaveLength(5);
    const total = [...lookups.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(5 + HYDRATE_CONCURRENCY - 1);
  });
});

describe("solo", () => {
  it("un extrait en cache expire est re-cherche, jamais servi", async () => {
    const joueur = await newGuest("solo_expire");
    // Signature Deezer expiree en 2001 : l'URL renverrait 403, donc pas de son.
    const expired = "https://cdns-preview.test/x.mp3?hdnea=exp=1000000000~acl=*~hmac=0";
    await giveLibrary(joueur, 12, 12, expired);

    const reply = await call(gamesController.startSoloGame, joueur, { body: { source: "library", count: 10 } });

    expect(reply.status).toBe(200);
    const urls = field<Array<{ audio_url: string | null }>>(reply, "tracks").map(t => t.audio_url);
    expect(urls).toHaveLength(10);
    expect(urls.every(url => Boolean(url) && !url!.includes("exp=1000000000"))).toBe(true);
  });
});
