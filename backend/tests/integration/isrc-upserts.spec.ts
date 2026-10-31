/**
 * L'ISRC dans audio_sources.metadata, contre une vraie base de test :
 * - l'import par lien (importController) ajoute l'ISRC sans effacer les autres
 *   cles, et un reimport sans ISRC ne l'efface pas ;
 * - METADATA_KEEPING_ISRC garde un ISRC deja connu quand la nouvelle metadata
 *   n'en a pas. (La synchro du compte Spotify connecte qui l'utilisait est
 *   retiree avec la connexion, T15.)
 *
 * Base : TEST_DATABASE_URL (voir tests/testDatabase.ts), jamais la prod.
 */
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../src/services/trackResolution", () => ({
  ...jest.requireActual("../../src/services/trackResolution"),
  hydratePreviewUrl: jest.fn().mockResolvedValue(null),
}));

import { resolveTestDatabaseUrl } from "../testDatabase";
import { pool, seedUsers, cleanupUsers, closePool, type TestUser } from "./helpers/socket-test-harness";
import { upsertTrack } from "../../src/controllers/importController";
import type { ImportedTrack } from "../../src/services/profileImportService";
import { METADATA_KEEPING_ISRC } from "../../src/services/isrcMetadata";

resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);

const EXT = "IsrcUpsert000000000001";
let users: TestUser[] = [];

const track = (isrc: string | null): ImportedTrack => ({
  title: "You Say Run", artist: "Yuki Hayashi", album: "OST", cover: null,
  externalId: EXT, provider: "spotify", durationMs: 228746, isrc,
});
const metadataOf = async () =>
  (await pool.query("SELECT metadata FROM audio_sources WHERE provider = 'spotify' AND external_id = $1", [EXT])).rows[0]?.metadata;

beforeAll(async () => {
  users = await seedUsers(2, "Isrc");
});

beforeEach(async () => {
  await pool.query("DELETE FROM audio_sources WHERE external_id = $1", [EXT]);
});

afterAll(async () => {
  await pool.query("DELETE FROM audio_sources WHERE external_id = $1", [EXT]);
  await cleanupUsers(users);
  await closePool();
});

describe("import par lien : upsertTrack", () => {
  it("un morceau deja la recoit l'ISRC, ses autres cles restent", async () => {
    await upsertTrack(users[0].id, track(null), "playlistA", null);
    await pool.query("UPDATE audio_sources SET metadata = metadata || '{\"note\": \"gardee\"}'::jsonb WHERE external_id = $1", [EXT]);
    await upsertTrack(users[0].id, track("JPZ921607277"), "playlistB", null);
    expect(await metadataOf()).toMatchObject({ import_source: "spotify", playlist_id: "playlistA", album: "OST", note: "gardee", isrc: "JPZ921607277" });
  });

  it("un reimport sans ISRC ne l'efface pas", async () => {
    await upsertTrack(users[0].id, track("JPZ921607277"), "playlistA", null);
    await upsertTrack(users[0].id, track(null), "playlistA", null);
    expect((await metadataOf()).isrc).toBe("JPZ921607277");
  });
});

// T4 : upsertTrack est une seule commande (WITH ... INSERT) qui doit faire
// les deux a la fois, meme quand le morceau existe deja chez un autre joueur :
// relier CE joueur au morceau (user_audio_sources, avec sa carte) ET fusionner
// l'ISRC appris dans la metadata.
describe("upsertTrack : lien du joueur et ISRC dans la meme commande", () => {
  const linksOf = async () => (await pool.query(
    `SELECT ua.user_id, ua.link_id FROM user_audio_sources ua
     JOIN audio_sources a ON a.id = ua.audio_source_id
     WHERE a.provider = 'spotify' AND a.external_id = $1 ORDER BY ua.user_id`,
    [EXT]
  )).rows;

  afterEach(async () => {
    await pool.query("DELETE FROM imported_links WHERE user_id = ANY($1::int[])", [users.map(u => u.id)]);
  });

  it("un 2e joueur importe un morceau connu sans ISRC : il y est relie, avec sa carte, et l'ISRC arrive", async () => {
    const [ana, ben] = users;
    await upsertTrack(ana.id, track(null), "playlistA", null);
    expect((await metadataOf()).isrc).toBeNull(); // pas encore d'ISRC

    const { rows: [carte] } = await pool.query<{ id: number }>(
      `INSERT INTO imported_links (user_id, url, normalized_url, kind, label)
       VALUES ($1, 'https://open.spotify.com/playlist/b', 'spotify:playlist:b', 'playlist', 'Carte de Ben') RETURNING id`,
      [ben.id]
    );
    await upsertTrack(ben.id, track("JPZ921607277"), "playlistB", carte.id);

    expect(await metadataOf()).toMatchObject({ isrc: "JPZ921607277", playlist_id: "playlistA" });
    expect(await linksOf()).toEqual([
      { user_id: ana.id, link_id: null },
      { user_id: ben.id, link_id: carte.id },
    ]);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM audio_sources WHERE provider = 'spotify' AND external_id = $1", [EXT]);
    expect(rows[0].n).toBe(1); // un seul morceau, partage
  });
});

// L'expression qui servait aux upserts du compte Spotify connecte (retires, T15).
describe("METADATA_KEEPING_ISRC", () => {
  const upsert = (metadata: Record<string, unknown>) => pool.query(
    `INSERT INTO audio_sources (provider, external_id, title, artist, metadata)
     VALUES ('spotify', $1, 'Titre', 'Artiste', $2::jsonb)
     ON CONFLICT (provider, external_id) DO UPDATE SET ${METADATA_KEEPING_ISRC}`,
    [EXT, JSON.stringify(metadata)]
  );

  it("remplace metadata mais garde l'ISRC connu, et prend un nouvel ISRC", async () => {
    await upsert({ album: "A", isrc: "JPZ921607277" });
    await upsert({ album: "B", isrc: null });
    expect(await metadataOf()).toEqual({ album: "B", isrc: "JPZ921607277" });
    await upsert({ album: "C" });
    expect(await metadataOf()).toEqual({ album: "C", isrc: "JPZ921607277" });
    await upsert({ album: "D", isrc: "JPZ921600001" });
    expect(await metadataOf()).toEqual({ album: "D", isrc: "JPZ921600001" });
  });

  it("sans ISRC d'aucun cote : rien d'invente", async () => {
    await upsert({ album: "A" });
    await upsert({ album: "B" });
    expect(await metadataOf()).toEqual({ album: "B" });
  });
});
