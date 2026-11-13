/**
 * T37 : importer, retirer, reimporter une playlist, contre une vraie base de test.
 *
 * Vu en vrai le 12/11/2026 (soiree a 8) :
 * - l'ecran /jouer demande 50 titres par playlist : une playlist de 200
 *   morceaux donnait toujours les 50 memes, et la reimporter « remettait les
 *   memes musiques » ;
 * - une playlist reimportee apres modification gardait sur sa carte les
 *   morceaux qu'on en avait retires ;
 * - Spotify lent ou en panne : le joueur lisait « Erreur lors de la
 *   synchronisation des titres. », sans savoir quoi faire.
 *
 * Ce qui est verifie :
 * - une playlist seule s'importe en entier (jusqu'a 500 titres), quel que soit
 *   le nombre demande par l'ecran ; un profil garde sa limite par playlist ;
 * - reimporter une playlist modifiee : la carte suit la playlist (les morceaux
 *   retires partent, ceux ajoutes arrivent) ;
 * - une lecture incomplete (une page Deezer en echec) ne retire rien ;
 * - un morceau retire de la carte reste a un autre joueur et a une autre
 *   carte ; la migration 005 rejouee ne le remet pas ;
 * - retirer une playlist puis en importer une autre : seule la nouvelle reste ;
 * - Spotify ou Deezer qui ne repondent pas : un message qui dit quoi faire.
 *
 * Aucun appel reseau : les playlists sont simulees.
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
  fetchPlaylistTracksChecked: jest.fn(),
}));
jest.mock("../../src/services/deezerPreviewService", () => ({
  deezerPreviewService: { resolvePreview: async () => null },
}));
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(async () => ({ data: {} })) } }));

import crypto from "crypto";
import type { Request, Response } from "express";
import { resolveTestDatabaseUrl } from "../testDatabase";
import { pool } from "../../src/config/db";
import { getSessionContext } from "../../src/utils/session";
import {
  fetchPlaylistTracksChecked,
  fetchPublicPlaylists,
  type ImportedTrack,
} from "../../src/services/profileImportService";
import { activeLinkIds, claimLegacyTracks, ensureLinksSchema, keepNewestActive, linksController } from "../../src/controllers/linksController";
import { ensureUserTracksSchema } from "../../src/services/userTracks";
import { importController } from "../../src/controllers/importController";

resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);
jest.setTimeout(30000);

const RUN = crypto.randomUUID().slice(0, 8);

const track = (n: number): ImportedTrack => ({
  title: `Morceau ${RUN} ${n}`, artist: "Artiste", album: null, cover: null,
  externalId: `${RUN}-re-${n}`, provider: "deezer", durationMs: 30000,
});
const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

/** Le faux Deezer : numero de playlist -> morceaux ; `broken` : la lecture s'arrete en route. */
const playlists = new Map<string, number[]>();
const broken = new Set<string>();
let down: Error | null = null;

const mockTracks = fetchPlaylistTracksChecked as jest.MockedFunction<typeof fetchPlaylistTracksChecked>;
const mockPlaylists = fetchPublicPlaylists as jest.MockedFunction<typeof fetchPublicPlaylists>;
mockTracks.mockImplementation(async (_provider, id, max) => {
  if (down) throw down;
  const all = (playlists.get(id) ?? []).map(track);
  if (broken.has(id)) return { tracks: all.slice(0, Math.floor(all.length / 2)), complete: false };
  return { tracks: all.slice(0, max ?? 500), complete: true };
});
mockPlaylists.mockImplementation(async parsed => [
  { id: parsed.id, name: `Playlist ${parsed.id}`, trackCount: playlists.get(parsed.id)?.length ?? 0, cover: null },
]);

type Envelope = { success: boolean; data: Record<string, unknown> | null; error: { code: string; message: string } | null };
type Reply = { status: number; body: Envelope };

async function call(handler: (req: Request, res: Response) => Promise<void>, userId: number, req: { body?: unknown; params?: Record<string, string> } = {}): Promise<Reply> {
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
  };
  await handler({ body: req.body ?? {}, params: req.params ?? {}, query: {}, headers: {}, ip: "127.0.0.1" } as unknown as Request, res as unknown as Response);
  return reply;
}

async function newGuest(name: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (provider, provider_id, username) VALUES ('guest', $1, $2) RETURNING id`,
    [crypto.randomUUID(), `${name}_${RUN}`],
  );
  return rows[0].id;
}

/** Le parcours de /jouer : coller le lien, puis importer avec 50 titres par playlist. */
async function importLink(userId: number, playlistId: string, perPlaylist = 50): Promise<{ linkId: number; sync: Reply }> {
  const listed = await call(importController.playlists, userId, { body: { url: `https://www.deezer.com/fr/playlist/${playlistId}` } });
  expect(listed.status).toBe(200);
  const linkId = Number(listed.body.data?.linkId);
  const sync = await call(importController.syncAll, userId, {
    body: { provider: "deezer", playlistIds: [playlistId], maxTracksPerPlaylist: perPlaylist, linkId },
  });
  return { linkId, sync };
}

/** Les numeros de morceaux du joueur, d'une carte ou de toutes. */
async function tracksOf(userId: number, linkId?: number): Promise<number[]> {
  const { rows } = await pool.query<{ external_id: string }>(
    `SELECT a.external_id FROM user_audio_sources ua JOIN audio_sources a ON a.id = ua.audio_source_id
     WHERE ua.user_id = $1 AND ($2::int IS NULL OR ua.link_id = $2) AND a.external_id LIKE $3`,
    [userId, linkId ?? null, `${RUN}-re-%`],
  );
  return rows.map(r => Number(r.external_id.split("-").pop())).sort((a, b) => a - b);
}

beforeAll(async () => {
  await ensureLinksSchema();
  await ensureUserTracksSchema();
});

afterEach(() => {
  broken.clear();
  down = null;
});

afterAll(async () => {
  await pool.end();
});

describe("une playlist s'importe en entier", () => {
  it("200 morceaux, l'ecran en demande 50 : les 200 arrivent", async () => {
    playlists.set("9001", range(1, 200));
    const lea = await newGuest("lea");
    const { linkId, sync } = await importLink(lea, "9001", 50);
    expect(sync.status).toBe(200);
    expect(sync.body.data?.synced).toBe(200);
    expect(await tracksOf(lea, linkId)).toEqual(range(1, 200));
  });

  it("un profil garde sa limite par playlist", async () => {
    playlists.set("9101", range(1001, 30));
    playlists.set("9102", range(1101, 30));
    const max = await newGuest("max");
    const reply = await call(importController.syncAll, max, {
      body: { provider: "deezer", playlistIds: ["9101", "9102"], maxTracksPerPlaylist: 10 },
    });
    expect(reply.body.data?.synced).toBe(20);
  });
});

describe("reimporter une playlist modifiee", () => {
  it("la carte suit la playlist : les morceaux retires partent, les nouveaux arrivent", async () => {
    playlists.set("9201", range(2001, 12));
    const eva = await newGuest("eva");
    const { linkId } = await importLink(eva, "9201");
    playlists.set("9201", [...range(2001, 6), ...range(2101, 4)]);
    const again = await importLink(eva, "9201");
    expect(again.linkId).toBe(linkId);
    expect(await tracksOf(eva, linkId)).toEqual([...range(2001, 6), ...range(2101, 4)]);
    // La carte affiche le bon compte.
    const cards = await call(linksController.list, eva);
    const card = (cards.body.data?.links as Array<{ id: number; track_count: string }>).find(l => l.id === linkId);
    expect(Number(card?.track_count)).toBe(10);
  });

  it("un profil reimporte en rapide (10 par playlist) ne retire rien de la carte", async () => {
    playlists.set("9311", range(3101, 30));
    playlists.set("9312", range(3201, 30));
    const sam = await newGuest("sam");
    const { rows: [carte] } = await pool.query<{ id: number }>(
      `INSERT INTO imported_links (user_id, url, normalized_url, provider, kind, label)
       VALUES ($1, 'https://www.deezer.com/profile/1', 'deezer.com/profile/1', 'deezer', 'user', 'Profil') RETURNING id`,
      [sam],
    );
    const sync = (n: number) => call(importController.syncAll, sam, {
      body: { provider: "deezer", playlistIds: ["9311", "9312"], maxTracksPerPlaylist: n, linkId: carte.id },
    });
    await sync(30);
    await sync(10);
    expect(await tracksOf(sam, carte.id)).toHaveLength(60);
  });

  it("une lecture incomplete (page Deezer en echec) ne retire rien", async () => {
    playlists.set("9301", range(3001, 20));
    const noe = await newGuest("noe");
    const { linkId } = await importLink(noe, "9301");
    broken.add("9301");
    await importLink(noe, "9301");
    expect(await tracksOf(noe, linkId)).toEqual(range(3001, 20));
  });

  it("un morceau retire de la carte reste a un autre joueur et a une autre carte, meme apres la migration 005 rejouee", async () => {
    playlists.set("9401", range(4001, 8));
    playlists.set("9402", range(4005, 8)); // 4005 a 4008 en commun
    const ana = await newGuest("ana");
    const ben = await newGuest("ben");
    const first = await importLink(ana, "9401"); // ana est la premiere importeuse
    await importLink(ben, "9401");
    await importLink(ana, "9402");
    playlists.set("9401", range(4001, 2));
    await importLink(ana, "9401");
    await ensureUserTracksSchema();
    expect(await tracksOf(ana, first.linkId)).toEqual(range(4001, 2));
    expect(await tracksOf(ana)).toEqual([...range(4001, 2), ...range(4005, 8)]);
    expect(await tracksOf(ben)).toEqual(range(4001, 8));
  });
});

describe("retirer une playlist", () => {
  it("retirer la premiere puis en importer une autre : seule la nouvelle reste", async () => {
    playlists.set("9501", range(5001, 10));
    playlists.set("9502", range(5101, 10));
    const ivy = await newGuest("ivy");
    const first = await importLink(ivy, "9501");
    expect((await call(linksController.remove, ivy, { params: { id: String(first.linkId) } })).status).toBe(200);
    await importLink(ivy, "9502");
    await ensureUserTracksSchema();
    expect(await tracksOf(ivy)).toEqual(range(5101, 10));
  });
});

describe("Spotify ou Deezer ne repondent pas : un message qui dit quoi faire", () => {
  const timeout = Object.assign(new Error("timeout of 15000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" });
  const unavailable = Object.assign(new Error("Request failed with status code 503"), { isAxiosError: true, response: { status: 503 } });

  it.each([
    ["spotify", timeout, "spotify_unavailable", "Spotify ne répond pas"],
    ["spotify", unavailable, "spotify_unavailable", "Spotify ne répond pas"],
    ["deezer", unavailable, "deezer_unavailable", "Deezer ne répond pas"],
  ])("%s, %s : 503 et un message clair", async (provider, err, code, text) => {
    down = err as Error;
    const zed = await newGuest("zed");
    const reply = await call(importController.syncAll, zed, { body: { provider, playlistIds: ["9601"] } });
    expect(reply.status).toBe(503);
    expect(reply.body.error?.code).toBe(code);
    expect(reply.body.error?.message).toContain(text);
    expect(reply.body.error?.message).toContain("Réessaie");
    expect(reply.body.error?.message.toLowerCase()).not.toContain("erreur");
  });

  it("playlist vide ou privee : quoi faire, sans le mot erreur", async () => {
    playlists.set("9701", []);
    const kim = await newGuest("kim");
    const reply = await call(importController.syncAll, kim, { body: { provider: "deezer", playlistIds: ["9701"] } });
    expect(reply.status).toBe(400);
    expect(reply.body.error?.message).toContain("publique");
  });
});

// T37, decision de Tym du 13/11 : une seule playlist par joueur et par partie.
describe("une playlist par joueur", () => {
  const activeCards = async (userId: number): Promise<number[]> =>
    (await pool.query<{ id: number }>(`SELECT id FROM imported_links WHERE user_id = $1 AND active ORDER BY id`, [userId])).rows.map(r => r.id);

  it("importer une 2e playlist la rend seule cochee : la partie ne pioche plus dans la 1re", async () => {
    playlists.set("9801", range(8001, 6));
    playlists.set("9802", range(8101, 6));
    const lou = await newGuest("lou");
    const first = await importLink(lou, "9801");
    const second = await importLink(lou, "9802");
    expect(await activeCards(lou)).toEqual([second.linkId]);
    expect(await activeLinkIds(lou)).toEqual([second.linkId]);
    // La 1re reste dans la bibliotheque, decochee, avec ses titres.
    expect(await tracksOf(lou, first.linkId)).toEqual(range(8001, 6));
  });

  it("reimporter la 1re la recoche, seule", async () => {
    playlists.set("9811", range(8201, 4));
    playlists.set("9812", range(8301, 4));
    const rob = await newGuest("rob");
    const first = await importLink(rob, "9811");
    await importLink(rob, "9812");
    await importLink(rob, "9811");
    expect(await activeCards(rob)).toEqual([first.linkId]);
  });

  it("cocher une carte decoche les autres", async () => {
    playlists.set("9821", range(8401, 4));
    playlists.set("9822", range(8501, 4));
    const pia = await newGuest("pia");
    const first = await importLink(pia, "9821");
    const second = await importLink(pia, "9822");
    const reply = await call(linksController.toggle, pia, { params: { id: String(first.linkId) }, body: { active: true } });
    expect(reply.status).toBe(200);
    expect(await activeCards(pia)).toEqual([first.linkId]);
    // Decocher reste possible (l'API ne change pas) : plus rien ne joue.
    await call(linksController.toggle, pia, { params: { id: String(first.linkId) }, body: { active: false } });
    expect(await activeCards(pia)).toEqual([]);
    expect(second.linkId).not.toBe(first.linkId);
  });

  it("cocher la carte d'un autre joueur ne touche a rien", async () => {
    playlists.set("9831", range(8601, 4));
    const una = await newGuest("una");
    const vic = await newGuest("vic");
    const card = await importLink(una, "9831");
    const reply = await call(linksController.toggle, vic, { params: { id: String(card.linkId) }, body: { active: true } });
    expect(reply.status).toBe(404);
    expect(await activeCards(una)).toEqual([card.linkId]);
  });

  it("un joueur qui avait deja plusieurs cartes cochees : la plus recente reste", async () => {
    const wes = await newGuest("wes");
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO imported_links (user_id, url, normalized_url, kind, label, active, last_import_at) VALUES
         ($1, 'https://www.deezer.com/playlist/1', 'deezer.com/playlist/1', 'playlist', 'A', TRUE, NOW() - INTERVAL '2 days'),
         ($1, 'https://www.deezer.com/playlist/2', 'deezer.com/playlist/2', 'playlist', 'B', TRUE, NOW() - INTERVAL '1 day'),
         ($1, 'https://www.deezer.com/playlist/3', 'deezer.com/playlist/3', 'playlist', 'C', FALSE, NOW())
       RETURNING id`,
      [wes],
    );
    // Avant le menage, la partie ne prend deja que la plus recente des cochees.
    expect(await activeLinkIds(wes)).toEqual([rows[1].id]);
    await keepNewestActive();
    expect(await activeCards(wes)).toEqual([rows[1].id]);
  });

  it("les « Imports precedents » ne se cochent pas par-dessus la playlist choisie", async () => {
    playlists.set("9841", range(8701, 4));
    const yan = await newGuest("yan");
    const card = await importLink(yan, "9841");
    // Des titres arrives sans carte (ancien ecran /import).
    const { rows: [orphan] } = await pool.query<{ id: string }>(
      `INSERT INTO audio_sources (provider, external_id, title, artist) VALUES ('deezer', $1, 'Orphelin', 'A') RETURNING id`,
      [`${RUN}-re-orphan`],
    );
    await pool.query(`INSERT INTO user_audio_sources (user_id, audio_source_id, link_id) VALUES ($1, $2, NULL)`, [yan, orphan.id]);
    await claimLegacyTracks(yan);
    expect(await activeCards(yan)).toEqual([card.linkId]);
  });
});
