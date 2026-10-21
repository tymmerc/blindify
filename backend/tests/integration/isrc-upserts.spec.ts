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
  users = await seedUsers(1, "Isrc");
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
