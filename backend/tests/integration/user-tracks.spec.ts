/**
 * Bibliotheque par joueur (migration 005, table user_audio_sources) contre une
 * vraie base de test.
 *
 * Le defaut corrige : un morceau n'existe qu'une fois sur la plateforme, et
 * l'import le laissait au PREMIER importeur. Lea importe sa playlist, revient
 * en invite sur un autre telephone et la reimporte : l'ecran dit « 12 titres
 * importes », sa carte en montre 0 et sa salle refuse de partir
 * (need_more_music). Pareil pour deux amis qui collent la meme playlist.
 *
 * Ce qui est verifie :
 * - le demarrage du backend applique la migration 005, qui se rejoue sans rien
 *   changer et reprend l'existant (premier importeur et sa carte) ;
 * - le declencheur relie le proprietaire ecrit par l'ancien code et les outils ;
 * - deux importeurs de la meme playlist ont chacun leurs 12 titres, sans doublon,
 *   et reimporter ne cree rien de plus ;
 * - la salle du second importeur se lance ; le tourniquet reste equitable avec
 *   des playlists qui se chevauchent ; « qui a mis quoi » connait tous les
 *   importeurs presents d'un morceau partage ; le recapitulatif donne le joueur
 *   de la partie ;
 * - le solo par bibliotheque du second importeur joue ses titres ;
 * - retirer une carte ne retire que ses liens a soi ;
 * - le janitor garde un invite qui a des morceaux sans en etre le premier
 *   importeur ; supprimer un invite ou un compte garde les morceaux encore
 *   lies a d'autres.
 *
 * Deezer n'est jamais appele : l'import et les extraits sont simules.
 * Base : TEST_DATABASE_URL (voir tests/testDatabase.ts), jamais la prod.
 */
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../src/utils/session", () => ({
  ...jest.requireActual("../../src/utils/session"),
  getSessionContext: jest.fn(),
}));
jest.mock("../../src/services/profileImportService", () => ({
  ...jest.requireActual("../../src/services/profileImportService"),
  fetchPublicPlaylists: jest.fn(),
  fetchPlaylistTracks: jest.fn(),
}));
jest.mock("../../src/services/deezerPreviewService", () => {
  const searchTrack = jest.fn(async (title: string) => ({ preview: `https://extraits.test/${encodeURIComponent(title)}.mp3` }));
  return {
    deezerPreviewService: {
      searchTrack,
      // Chemins de #64 : par ISRC / identifiant, puis recherche ; ici tout est trouve.
      resolvePreview: async (query: { title: string }) => searchTrack(query.title),
      resolvePreviewOutcome: async (query: { title: string }) => ({ status: "found", track: await searchTrack(query.title) }),
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
import { fetchPlaylistTracks, fetchPublicPlaylists, type ImportedTrack } from "../../src/services/profileImportService";
import { ensureLinksSchema } from "../../src/controllers/linksController";
import { bySmallestLibrary, ensureUserTracksSchema, linkTrackToUser } from "../../src/services/userTracks";
import { DEAD_GUEST_FILTER } from "../../src/services/deadGuests";
import { importController } from "../../src/controllers/importController";
import { linksController } from "../../src/controllers/linksController";
import { roomsController } from "../../src/controllers/roomsController";
import { gamesController } from "../../src/controllers/gamesController";
import { authController } from "../../src/controllers/authController";
import { audioSourcesController } from "../../src/controllers/audioSourcesController";
import { fetchAudioSources } from "../../src/services/trackResolution";
import * as realtimeGame from "../../src/services/realtimeGame";
import { clearGame } from "../../src/services/realtimeGame";
import { clearAdvanceTimer, clearRevealTimer } from "../../src/services/realtimeOrchestrator";

// Sans base de test jetable, la suite s'arrete ici, avant toute requete.
resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);

jest.setTimeout(30000);

const RUN = crypto.randomUUID().slice(0, 8);

// ---- faux catalogue Deezer ---------------------------------------------------

/** Morceau n du faux catalogue de ce passage (identifiant Deezer unique au passage). */
function track(n: number): ImportedTrack {
  return {
    title: `Morceau ${RUN} ${n}`,
    artist: `Artiste ${n % 7}`,
    album: null,
    cover: null,
    externalId: `${RUN}-${n}`,
    provider: "deezer",
    durationMs: 30000,
  };
}
const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

// Playlists du faux Deezer : numero -> morceaux.
const PLAYLISTS = new Map<string, number[]>([
  ["101", range(1, 12)],                      // la playlist de Lea
  ["201", [...range(20, 6), ...range(30, 6)]], // Dora : 6 morceaux en commun avec Eli, 6 a elle
  ["202", [...range(20, 6), ...range(40, 6)]], // Eli
  ["301", range(50, 12)],                     // Fanny : toute la playlist de Gus est dedans
  ["302", range(50, 6)],                      // Gus
  ["401", range(70, 12)],                     // Hugo et Ines : la meme playlist
  ["501", [...range(90, 6), ...range(100, 6)]], // Lou : 6 morceaux partages avec Max, 6 a elle seule
  ["502", [...range(90, 6), ...range(110, 6)]], // Max
  ["601", range(130, 12)],                    // Pia puis Rob : la meme playlist
  ["701", range(150, 12)],                    // Una puis Vic : la meme playlist
  ["702", range(170, 12)],                    // Wes puis Yan : la meme playlist
  ["703", range(190, 12)],                    // Zoe, puis l'ancien backend lui retire sa carte
  ["704", range(210, 12)],                    // Abel puis Bea : xmin des liens
  ["801", range(230, 12)],                    // Kim : carte decochee
  ["802", range(250, 3)],                     // Kim : carte cochee, 3 titres
  ["803", range(260, 6)],                     // Leo : 6 titres
]);
const externalIds = (playlistId: string) => (PLAYLISTS.get(playlistId) ?? []).map(n => `${RUN}-${n}`);

const mockSession = getSessionContext as jest.MockedFunction<typeof getSessionContext>;
const mockTracks = fetchPlaylistTracks as jest.MockedFunction<typeof fetchPlaylistTracks>;
const mockPlaylists = fetchPublicPlaylists as jest.MockedFunction<typeof fetchPublicPlaylists>;

mockTracks.mockImplementation(async (_provider, playlistId) => (PLAYLISTS.get(playlistId) ?? []).map(track));
mockPlaylists.mockImplementation(async parsed => [
  { id: parsed.id, name: `Playlist ${parsed.id}`, trackCount: PLAYLISTS.get(parsed.id)?.length ?? 0, cover: null },
]);

// ---- appels de controleurs ---------------------------------------------------

type Envelope = { success: boolean; data: Record<string, unknown> | null; error: { code: string; details?: unknown } | null };
type Reply = { status: number; body: Envelope };

/** Un champ de la reponse { success, data, error }, au type attendu par le test. */
const field = <T>(reply: Reply, key: string): T => reply.body.data?.[key] as T;

/** Un invite ; avec `connection`, un joueur relie a un service (son fonds commun est celui du service). */
function as(userId: number, connection: { provider: string } | null = null): void {
  mockSession.mockResolvedValue({
    user: { id: userId, provider: "guest", provider_id: `invite-${userId}`, username: `joueur${userId}` },
    connection,
    sessionToken: null,
  } as unknown as Awaited<ReturnType<typeof getSessionContext>>);
}

async function call(
  handler: (req: Request, res: Response) => Promise<void>,
  userId: number,
  req: { body?: unknown; params?: Record<string, string> } = {},
  connection: { provider: string } | null = null,
): Promise<Reply> {
  as(userId, connection);
  const reply: Reply = { status: 200, body: { success: false, data: null, error: null } };
  const res = {
    status(code: number) { reply.status = code; return res; },
    json(body: Envelope) { reply.body = body; return res; },
    setHeader() { return res; },
    clearCookie() { return res; },
    cookie() { return res; },
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

/** Le parcours de l'appli : coller le lien de la playlist, puis tout importer. */
async function importPlaylist(userId: number, playlistId: string): Promise<{ linkId: number; synced: number }> {
  const listed = await call(importController.playlists, userId, { body: { url: `https://www.deezer.com/fr/playlist/${playlistId}` } });
  expect(listed.status).toBe(200);
  const linkId = Number(field(listed, "linkId"));
  const synced = await call(importController.syncAll, userId, {
    body: { provider: "deezer", playlistIds: [playlistId], maxTracksPerPlaylist: 50, linkId },
  });
  expect(synced.status).toBe(200);
  return { linkId, synced: Number(field(synced, "synced")) };
}

async function cardsOf(userId: number): Promise<Array<{ id: number; label: string; track_count: number }>> {
  const reply = await call(linksController.list, userId);
  expect(reply.status).toBe(200);
  return field<Array<{ id: number; label: string; track_count: string | number }>>(reply, "links").map(l => ({
    id: l.id, label: l.label, track_count: Number(l.track_count),
  }));
}

async function linkedExternalIds(userId: number): Promise<string[]> {
  const { rows } = await pool.query<{ external_id: string }>(
    `SELECT a.external_id FROM user_audio_sources ua JOIN audio_sources a ON a.id = ua.audio_source_id
     WHERE ua.user_id = $1 AND a.external_id LIKE $2 ORDER BY a.external_id`,
    [userId, `${RUN}-%`],
  );
  return rows.map(r => r.external_id);
}

async function rowsFor(ids: string[]): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM audio_sources WHERE provider = 'deezer' AND external_id = ANY($1::text[])`,
    [ids],
  );
  return Number(rows[0].n);
}

const startedRooms: string[] = [];

/** Une salle « entre amis » en attente, l'hote en premier. */
async function newRoom(players: number[], questionCount = 10): Promise<string> {
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

type StartedTrack = { audioSourceId: string; track_id: string; metadata: { owner_user_id?: number | null; owner_user_ids?: number[] } };

/**
 * Lance la salle et rend ses manches telles que le serveur les a tirees. La
 * reponse HTTP les caviarde depuis #55 (anti-triche) : on les prend au
 * demarrage de la partie en memoire, « qui a mis quoi » compris.
 */
async function startRoom(code: string, hostId: number): Promise<Reply & { tracks: StartedTrack[] }> {
  const boot = jest.spyOn(realtimeGame, "bootstrapGameState");
  try {
    const reply = await call(roomsController.startGame, hostId, { params: { code }, body: { source: "library" } });
    startedRooms.push(code);
    const booted = boot.mock.calls.find(([params]) => params.roomCode === code)?.[0];
    const tracks = (booted?.tracks ?? []).map(t => ({
      audioSourceId: String(t.audioSourceId),
      track_id: t.trackId,
      metadata: t.metadata as StartedTrack["metadata"],
    }));
    return { ...reply, tracks };
  } finally {
    boot.mockRestore();
  }
}

function stopGame(code: string): void {
  clearRevealTimer(code);
  clearAdvanceTimer(code);
  clearGame(code);
}

function countByOwner(tracks: StartedTrack[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const t of tracks) {
    const owner = Number(t.metadata.owner_user_id);
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return counts;
}

// ---- cycle de vie ------------------------------------------------------------

let httpServer: http.Server;

beforeAll(async () => {
  // roomsController emet sur le socket.io du module : il doit exister.
  httpServer = http.createServer();
  initSocket(httpServer, ["*"]);
  await ensureLinksSchema();
  await ensureUserTracksSchema();
});

afterEach(() => {
  for (const code of startedRooms.splice(0)) stopGame(code);
});

afterAll(async () => {
  httpServer.close();
  await pool.end();
});

// ---- schema ------------------------------------------------------------------

/** Table, index, contraintes, declencheur et colonne ajoutee, sous une forme comparable. */
async function schemaShape() {
  const { rows: columns } = await pool.query(
    `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull,
            pg_get_expr(d.adbin, d.adrelid) AS defaut
     FROM pg_attribute a
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = 'user_audio_sources'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
  );
  const { rows: constraints } = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'user_audio_sources'::regclass ORDER BY conname`,
  );
  const { rows: indexes } = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename = 'user_audio_sources' OR indexname = 'idx_game_rounds_owner' ORDER BY indexname`,
  );
  const { rows: triggers } = await pool.query(
    `SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger
     WHERE tgrelid = 'audio_sources'::regclass AND NOT tgisinternal ORDER BY tgname`,
  );
  const { rows: roundOwner } = await pool.query(
    `SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute
     WHERE attrelid = 'game_rounds'::regclass AND attname = 'owner_user_id' AND NOT attisdropped`,
  );
  return { columns, constraints, indexes, triggers, roundOwner };
}

describe("migration 005 : user_audio_sources", () => {
  // Jamais de DROP ici : la base de test est partagee avec l'autre suite
  // d'integration, qui joue des parties en meme temps. La premiere application
  // (base neuve, schema de la prod) est celle du beforeAll.
  it("le demarrage applique la migration 005, qui se rejoue sans rien changer", async () => {
    const applied = await schemaShape();
    // Chaque demarrage du backend. (En prod, psql envoie chaque commande a
    // part : meme decoupage, verifie sur une base jetable avec psql.)
    await ensureUserTracksSchema();
    await ensureUserTracksSchema();
    expect(await schemaShape()).toEqual(applied);

    expect(applied.columns.map(c => c.attname)).toEqual(["user_id", "audio_source_id", "link_id", "created_at"]);
    expect(applied.constraints.map(c => c.def)).toEqual(expect.arrayContaining([
      "PRIMARY KEY (user_id, audio_source_id)",
      "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE",
      "FOREIGN KEY (audio_source_id) REFERENCES audio_sources(id) ON DELETE CASCADE",
      "FOREIGN KEY (link_id) REFERENCES imported_links(id) ON DELETE SET NULL",
    ]));
    expect(applied.indexes.map(i => i.indexname)).toEqual([
      "idx_game_rounds_owner", "idx_user_audio_sources_link", "idx_user_audio_sources_source", "user_audio_sources_pkey",
    ]);
    expect(applied.triggers.map(t => t.tgname)).toEqual(["audio_sources_lien_proprietaire", "audio_sources_lien_retire"]);
    // Index partiel : les manches d'avant la migration n'ont pas de contributeur.
    expect(applied.indexes.find(i => i.indexname === "idx_game_rounds_owner")?.indexdef).toContain("WHERE (owner_user_id IS NOT NULL)");
    expect(applied.roundOwner).toEqual([{ type: "integer" }]);
  });

  it("deux demarrages en meme temps : la migration passe pour les deux", async () => {
    // Le backend et le backend de dev qui redemarrent ensemble. Sans verrou,
    // le second echouait (XX000 « tuple concurrently updated » sur la fonction).
    const runs = await Promise.allSettled([1, 2, 3, 4].map(() => ensureUserTracksSchema()));
    expect(runs.filter(r => r.status === "rejected")).toEqual([]);
  });

  it("reprend l'existant : le premier importeur garde son lien et sa carte, une carte etrangere est ecartee", async () => {
    const owner = await newGuest("ancien");
    const other = await newGuest("autre");
    const { rows: links } = await pool.query<{ id: number }>(
      `INSERT INTO imported_links (user_id, url, normalized_url, kind, label)
       VALUES ($1, 'u1', $2, 'playlist', 'Ma carte'), ($3, 'u2', $4, 'playlist', 'Sa carte') RETURNING id`,
      [owner, `n1-${RUN}`, other, `n2-${RUN}`],
    );
    const [mine, foreign] = links.map(l => l.id);
    const { rows: sources } = await pool.query<{ id: string }>(
      `INSERT INTO audio_sources (provider, external_id, user_id, title, artist, link_id)
       VALUES ('deezer', $1, $3, 'Ancien 1', 'A', $4), ('deezer', $2, $3, 'Ancien 2', 'A', $5) RETURNING id`,
      [`${RUN}-ancien-1`, `${RUN}-ancien-2`, owner, mine, foreign],
    );
    // Etat d'avant la migration : la colonne historique seule, sans lien.
    await pool.query(`DELETE FROM user_audio_sources WHERE user_id = $1`, [owner]);

    await ensureUserTracksSchema();
    await ensureUserTracksSchema();

    const { rows } = await pool.query<{ audio_source_id: string; link_id: number | null }>(
      `SELECT audio_source_id, link_id FROM user_audio_sources WHERE user_id = $1 ORDER BY link_id NULLS LAST`,
      [owner],
    );
    expect(rows).toEqual([
      { audio_source_id: sources[0].id, link_id: mine },
      { audio_source_id: sources[1].id, link_id: null },
    ]);
  });

  it("le declencheur relie le proprietaire que l'ancien code ou un outil ecrit dans audio_sources", async () => {
    const seeded = await newGuest("outil");
    const { rows: link } = await pool.query<{ id: number }>(
      `INSERT INTO imported_links (user_id, url, normalized_url, kind, label) VALUES ($1, 'u', $2, 'playlist', 'Bibli de test') RETURNING id`,
      [seeded, `n3-${RUN}`],
    );
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO audio_sources (provider, external_id, user_id, title, artist, link_id)
       VALUES ('deezer', $1, $2, 'Graine', 'B', NULL) RETURNING id`,
      [`${RUN}-graine`, seeded],
    );
    await pool.query(`UPDATE audio_sources SET link_id = $1 WHERE id = $2`, [link[0].id, rows[0].id]);

    const { rows: linked } = await pool.query(
      `SELECT user_id, link_id FROM user_audio_sources WHERE audio_source_id = $1`,
      [rows[0].id],
    );
    expect(linked).toEqual([{ user_id: seeded, link_id: link[0].id }]);
  });

  it("un lien qui ne change pas n'est jamais reecrit, ni par le declencheur ni par l'import", async () => {
    const abel = await newGuest("abel"); // premier importeur
    const bea = await newGuest("bea");
    await importPlaylist(abel, "704");
    const versions = async () => (await pool.query<{ audio_source_id: string; xmin: string }>(
      `SELECT audio_source_id, xmin::text FROM user_audio_sources WHERE user_id = $1 ORDER BY audio_source_id`,
      [abel],
    )).rows;
    const before = await versions();
    expect(before).toHaveLength(12);

    // Bea importe les memes morceaux : l'upsert d'audio_sources reecrit
    // user_id (inchange) et declenche le lien d'Abel. Puis Abel reimporte.
    await importPlaylist(bea, "704");
    await importPlaylist(abel, "704");

    expect(await versions()).toEqual(before);
  });

  it("pendant le deploiement, l'ancien backend qui retire une carte retire aussi le lien", async () => {
    const zoe = await newGuest("zoe");
    const { linkId } = await importPlaylist(zoe, "703");
    expect(await linkedExternalIds(zoe)).toHaveLength(12);

    // Ce que fait le code d'avant (image precedente, backend de dev) : il ne
    // connait que la colonne historique.
    await pool.query(`UPDATE audio_sources SET user_id=NULL, link_id=NULL WHERE link_id=$1 AND user_id=$2`, [linkId, zoe]);
    await pool.query(`DELETE FROM imported_links WHERE id=$1 AND user_id=$2`, [linkId, zoe]);

    expect(await linkedExternalIds(zoe)).toEqual([]);
    // Sans ca, les liens restaient sans carte et revenaient dans « Imports precedents ».
    expect(await cardsOf(zoe)).toEqual([]);
    await ensureUserTracksSchema();
    expect(await linkedExternalIds(zoe)).toEqual([]);
  });
});

// ---- import ------------------------------------------------------------------

describe("import : chaque importeur garde son lien avec les morceaux", () => {
  let lea: number;
  let leaAgain: number;

  beforeAll(async () => {
    lea = await newGuest("lea");
    leaAgain = await newGuest("lea_autre_tel");
  });

  it("la meme playlist importee par deux invites : chacun a ses 12 titres, une seule ligne par morceau", async () => {
    const first = await importPlaylist(lea, "101");
    const second = await importPlaylist(leaAgain, "101");

    expect(first.synced).toBe(12);
    expect(second.synced).toBe(12);
    expect(await linkedExternalIds(lea)).toEqual([...externalIds("101")].sort());
    expect(await linkedExternalIds(leaAgain)).toEqual([...externalIds("101")].sort());
    expect(await rowsFor(externalIds("101"))).toBe(12);

    const cards = await cardsOf(leaAgain);
    expect(cards).toEqual([expect.objectContaining({ id: second.linkId, track_count: 12 })]);
    const details = await call(linksController.details, leaAgain, { params: { id: String(second.linkId) } });
    expect(details.status).toBe(200);
    expect(Number(field<{ total: string }>(details, "stats").total)).toBe(12);
    expect(field(details, "tracks")).toHaveLength(12);
  });

  it("reimporter la meme playlist ne cree aucun doublon", async () => {
    const again = await importPlaylist(leaAgain, "101");

    expect(again.synced).toBe(12);
    expect(await rowsFor(externalIds("101"))).toBe(12);
    expect(await linkedExternalIds(leaAgain)).toHaveLength(12);
    expect(await cardsOf(leaAgain)).toEqual([expect.objectContaining({ id: again.linkId, track_count: 12 })]);
  });

  it("une carte qui n'est pas a soi n'est jamais attachee a ses titres", async () => {
    const intrus = await newGuest("intrus");
    const leaCard = (await cardsOf(lea))[0];
    const reply = await call(importController.syncAll, intrus, {
      body: { provider: "deezer", playlistIds: ["101"], maxTracksPerPlaylist: 50, linkId: leaCard.id },
    });

    expect(reply.status).toBe(200);
    const { rows } = await pool.query<{ link_id: number | null }>(
      `SELECT DISTINCT link_id FROM user_audio_sources WHERE user_id = $1`,
      [intrus],
    );
    expect(rows.map(r => r.link_id)).not.toContain(leaCard.id);
    expect((await cardsOf(lea))[0].track_count).toBe(12);
  });
});

describe("retirer une carte", () => {
  it("retire les liens de ce joueur seulement, et le demarrage ne les recree pas", async () => {
    const una = await newGuest("una"); // premiere importeuse
    const vic = await newGuest("vic");
    const first = await importPlaylist(una, "701");
    const second = await importPlaylist(vic, "701");

    const gone = await call(linksController.remove, vic, { params: { id: String(second.linkId) } });
    expect(gone.status).toBe(200);
    expect(await linkedExternalIds(vic)).toEqual([]);
    expect(await linkedExternalIds(una)).toHaveLength(12);
    expect((await cardsOf(una))[0].track_count).toBe(12);

    const goneFirst = await call(linksController.remove, una, { params: { id: String(first.linkId) } });
    expect(goneFirst.status).toBe(200);
    await ensureUserTracksSchema(); // la migration rejouee au demarrage reprend l'existant
    expect(await linkedExternalIds(una)).toEqual([]);
    expect(await linkedExternalIds(vic)).toEqual([]);
    expect(await rowsFor(externalIds("701"))).toBe(12); // detacher, jamais detruire
  });

  it("la premiere importeuse retire sa carte, le second garde la sienne et lance sa partie", async () => {
    const wes = await newGuest("wes"); // premier importeur
    const yan = await newGuest("yan");
    const tom = await newGuest("tom2");
    const first = await importPlaylist(wes, "702");
    await importPlaylist(yan, "702");

    const gone = await call(linksController.remove, wes, { params: { id: String(first.linkId) } });
    expect(gone.status).toBe(200);

    const code = await newRoom([yan, tom]);
    const lobby = await call(roomsController.details, yan, { params: { code } });
    const counts = field<Array<{ user_id: number; track_count: number }>>(lobby, "participants").map(p => [p.user_id, p.track_count]);
    expect(counts).toEqual([[yan, 12], [tom, 0]]);
    const started = await startRoom(code, yan);
    expect(started.status).toBe(200);
    expect(started.tracks).toHaveLength(10);
    expect(started.tracks.every(t => t.metadata.owner_user_id === yan)).toBe(true);
    expect(started.tracks.every(t => (t.metadata.owner_user_ids ?? []).join() === String(yan))).toBe(true);
  });
});

describe("les autres lectures de la bibliotheque", () => {
  it("GET /api/audio-sources rend ses morceaux au second importeur", async () => {
    const first = await newGuest("api_premier");
    const second = await newGuest("api_second");
    await importPlaylist(first, "101");
    await importPlaylist(second, "101");

    const reply = await call(audioSourcesController.index, second);

    expect(reply.status).toBe(200);
    const mine = field<Array<{ external_id: string }>>(reply, "sources").map(s => s.external_id).filter(id => id.startsWith(`${RUN}-`));
    expect(mine.sort()).toEqual([...externalIds("101")].sort());
  });

  it("titres likes : le second importeur les joue depuis sa carte", async () => {
    const first = await newGuest("like_premier");
    const second = await newGuest("like_second");
    await importPlaylist(first, "101");
    const { linkId } = await importPlaylist(second, "101");
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM audio_sources WHERE provider = 'deezer' AND external_id = ANY($1::text[]) ORDER BY external_id LIMIT 3`,
      [externalIds("101")],
    );
    for (const row of rows) {
      await pool.query(`INSERT INTO likes (user_id, audio_source_id) VALUES ($1, $2)`, [second, row.id]);
    }

    const liked = await fetchAudioSources(second, "deezer", 50, { likedOnly: true, linkIds: [linkId] });

    expect(liked.map(s => s.id).sort()).toEqual(rows.map(r => r.id).sort());
    expect(liked.every(s => s.user_id === second && s.link_id === linkId)).toBe(true);
  });

  it("le tourniquet range les bibliotheques comme le lobby les compte : cartes cochees seulement", async () => {
    const kim = await newGuest("kim");
    const leo = await newGuest("leo");
    const off = await importPlaylist(kim, "801");
    await importPlaylist(kim, "802");
    await importPlaylist(leo, "803");
    const toggled = await call(linksController.toggle, kim, { params: { id: String(off.linkId) }, body: { active: false } });
    expect(toggled.status).toBe(200);

    // Kim : 15 titres en tout, 3 qui jouent ce soir. Leo : 6.
    expect(await bySmallestLibrary([leo, kim])).toEqual([kim, leo]);
  });
});

// ---- partie entre amis -------------------------------------------------------

describe("lancement d'une partie", () => {
  it("Lea, revenue en invite sur un autre telephone, lance sa salle avec ses titres", async () => {
    const lea = await newGuest("lea2");
    const leaAgain = await newGuest("lea2_autre_tel");
    const tom = await newGuest("tom");
    await importPlaylist(lea, "101");
    await importPlaylist(leaAgain, "101");
    const code = await newRoom([leaAgain, tom]);

    const lobby = await call(roomsController.details, leaAgain, { params: { code } });
    const counts = field<Array<{ user_id: number; track_count: number }>>(lobby, "participants").map(p => [p.user_id, p.track_count]);
    expect(counts).toEqual([[leaAgain, 12], [tom, 0]]);

    const started = await startRoom(code, leaAgain);
    expect(started.status).toBe(200);
    expect(started.tracks).toHaveLength(10);
    expect(started.tracks.every(t => t.metadata.owner_user_id === leaAgain)).toBe(true);

    // Le recapitulatif de fin de partie relit les manches : c'est Lea qui les a apportees ce soir.
    const { rows: owners } = await pool.query<{ owner_user_id: number }>(
      `SELECT gr.owner_user_id FROM game_rounds gr JOIN multiplayer_rooms m ON m.session_id = gr.session_id WHERE m.room_code = $1`,
      [code],
    );
    expect(owners.map(o => o.owner_user_id)).toEqual(Array(10).fill(leaAgain));
    stopGame(code);
    await pool.query(`UPDATE multiplayer_rooms SET status = 'finished' WHERE room_code = $1`, [code]);
    const recap = await call(roomsController.state, tom, { params: { code } });
    const recapOwners = field<StartedTrack[]>(recap, "tracks").map(t => t.metadata.owner_user_id);
    expect(recapOwners).toEqual(Array(10).fill(leaAgain));
  });

  it("deux amis dont les playlists se chevauchent : le tourniquet reste equitable", async () => {
    const dora = await newGuest("dora");
    const eli = await newGuest("eli");
    await importPlaylist(dora, "201");
    await importPlaylist(eli, "202");

    for (let partie = 0; partie < 4; partie++) {
      const code = await newRoom([dora, eli]);
      const started = await startRoom(code, dora);
      expect(started.status).toBe(200);
      expect(started.tracks).toHaveLength(10);
      expect(new Set(started.tracks.map(t => t.audioSourceId)).size).toBe(10);
      const counts = countByOwner(started.tracks);
      expect([counts.get(dora), counts.get(eli)]).toEqual([5, 5]);
      stopGame(code);
    }
  });

  it("une playlist deja toute chez l'hote : l'invite a quand meme sa part", async () => {
    const fanny = await newGuest("fanny");
    const gus = await newGuest("gus");
    await importPlaylist(fanny, "301");
    await importPlaylist(gus, "302");

    for (let partie = 0; partie < 4; partie++) {
      const code = await newRoom([fanny, gus]);
      const started = await startRoom(code, fanny);
      expect(started.status).toBe(200);
      const counts = countByOwner(started.tracks);
      expect([counts.get(fanny), counts.get(gus)]).toEqual([5, 5]);
      stopGame(code);
    }
  });

  it("qui a mis quoi : un morceau partage revient a chacun de ses importeurs presents", async () => {
    const hugo = await newGuest("hugo");
    const ines = await newGuest("ines");
    const jo = await newGuest("jo");
    await importPlaylist(hugo, "401");
    await importPlaylist(ines, "401");
    const code = await newRoom([hugo, ines, jo]);

    const started = await startRoom(code, hugo);
    expect(started.status).toBe(200);
    for (const t of started.tracks) {
      expect(t.metadata.owner_user_ids).toEqual([hugo, ines].sort((a, b) => a - b));
      expect([hugo, ines]).toContain(t.metadata.owner_user_id);
    }
  });
});

// ---- solo --------------------------------------------------------------------

describe("solo par bibliotheque", () => {
  it("le second importeur d'une playlist joue ses titres", async () => {
    const first = await newGuest("solo_premier");
    const second = await newGuest("solo_second");
    await importPlaylist(first, "101");
    await importPlaylist(second, "101");

    const reply = await call(gamesController.startSoloGame, second, { body: { source: "library", count: 10 } });

    expect(reply.status).toBe(200);
    const played = field<Array<{ track_id: string }>>(reply, "tracks").map(t => t.track_id);
    expect(played).toHaveLength(10);
    expect(played.every(id => externalIds("101").includes(id))).toBe(true);
  });

  it("sans musique, le solo Deezer pioche dans le fonds commun, jamais un morceau qu'un joueur garde", async () => {
    const libres = range(300, 12).map(track);
    for (const t of libres) {
      await pool.query(
        `INSERT INTO audio_sources (provider, external_id, title, artist) VALUES ('deezer', $1, $2, $3)`,
        [t.externalId, t.title, t.artist],
      );
    }
    // Un morceau dont le premier importeur s'est retire (user_id vide) mais
    // qu'un autre joueur garde : il n'est pas au fonds commun.
    const garde = await newGuest("garde");
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO audio_sources (provider, external_id, title, artist) VALUES ('deezer', $1, 'Garde', 'G') RETURNING id`,
      [`${RUN}-garde`],
    );
    await linkTrackToUser(garde, rows[0].id, null);
    const sansMusique = await newGuest("sans_musique");

    const reply = await call(gamesController.startSoloGame, sansMusique, { body: { source: "library", count: 10 } }, { provider: "deezer" });

    expect(reply.status).toBe(200);
    const played = field<Array<{ track_id: string }>>(reply, "tracks").map(t => t.track_id);
    expect(played).toHaveLength(10);
    const { rows: owned } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM user_audio_sources ua JOIN audio_sources a ON a.id = ua.audio_source_id
       WHERE a.external_id = ANY($1::text[])`,
      [played],
    );
    expect(Number(owned[0].n)).toBe(0);
  });
});

// ---- suppression -------------------------------------------------------------

describe("suppression d'un invite ou d'un compte", () => {
  it("le janitor garde un invite qui a des morceaux sans en etre le premier importeur", async () => {
    const vide = await newGuest("vide");
    const musicien = await newGuest("musicien");
    await pool.query(`UPDATE users SET created_at = NOW() - INTERVAL '40 days' WHERE id = ANY($1::int[])`, [[vide, musicien]]);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO audio_sources (provider, external_id, title, artist) VALUES ('deezer', $1, 'Garde', 'J') RETURNING id`,
      [`${RUN}-janitor`],
    );
    await linkTrackToUser(musicien, rows[0].id, null);

    const { rows: dead } = await pool.query<{ id: number }>(DEAD_GUEST_FILTER.replace("LIMIT 500", "LIMIT 100000"));
    const ids = dead.map(d => d.id);
    expect(ids).toContain(vide);
    expect(ids).not.toContain(musicien);
  });

  it("la purge d'un invite garde les morceaux et la carte de celui qui les a aussi", async () => {
    const pia = await newGuest("pia");
    const rob = await newGuest("rob");
    await importPlaylist(pia, "601"); // Pia est la premiere importeuse
    await importPlaylist(rob, "601");

    await pool.query(`DELETE FROM users WHERE id = $1`, [pia]); // ce que fait le janitor

    expect(await rowsFor(externalIds("601"))).toBe(12);
    expect(await linkedExternalIds(rob)).toHaveLength(12);
    expect((await cardsOf(rob))[0].track_count).toBe(12);
  });

  it("supprimer son compte retire ses liens et ses morceaux a lui seul, jamais ceux des autres", async () => {
    const lou = await newGuest("lou");
    const max = await newGuest("max");
    await importPlaylist(lou, "501");
    await importPlaylist(max, "502");

    const reply = await call(authController.deleteAccount, lou);

    expect(reply.status).toBe(200);
    expect(await linkedExternalIds(lou)).toEqual([]);
    expect(await linkedExternalIds(max)).toHaveLength(12);
    expect(await rowsFor(externalIds("502"))).toBe(12);
    const louOnly = externalIds("501").filter(id => !externalIds("502").includes(id));
    expect(await rowsFor(louOnly)).toBe(0);
  });
});
