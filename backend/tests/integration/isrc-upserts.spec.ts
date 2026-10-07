/**
 * L'ISRC dans audio_sources.metadata, contre une vraie base de test :
 * - l'import par lien (importController) ajoute l'ISRC sans effacer les autres
 *   cles, et un reimport sans ISRC ne l'efface pas ;
 * - la synchro du compte Spotify connecte (spotifySync), qui remplace metadata
 *   a chaque passage, garde un ISRC deja connu quand Spotify n'en renvoie pas.
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
jest.mock("../../src/config/spotify", () => ({ makeSpotify: jest.fn() }));

import { resolveTestDatabaseUrl } from "../testDatabase";
import { pool, seedUsers, cleanupUsers, closePool, type TestUser } from "./helpers/socket-test-harness";
import { upsertTrack } from "../../src/controllers/importController";
import { syncSpotifyLibrary } from "../../src/services/providers/spotifySync";
import { makeSpotify } from "../../src/config/spotify";
import type { ImportedTrack } from "../../src/services/profileImportService";
import type { UserConnection } from "../../src/types/user";
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

describe("compte Spotify connecte : syncSpotifyLibrary", () => {
  const connection = {
    id: 1, user_id: 0, provider: "spotify", access_token: "jeton", refresh_token: null,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(), scope: null,
  } as unknown as UserConnection;
  const saved = (externalIds?: { isrc?: string }) => ({
    body: { items: [{ track: { id: EXT, name: "You Say Run", artists: [{ name: "Yuki Hayashi" }], album: { name: "OST" }, duration_ms: 228746, external_ids: externalIds } }] },
  });

  it("garde un ISRC connu quand Spotify n'en renvoie pas, et prend le nouveau sinon", async () => {
    const api = { getMySavedTracks: jest.fn() };
    (makeSpotify as jest.Mock).mockReturnValue(api);

    api.getMySavedTracks.mockResolvedValueOnce(saved({ isrc: "JPZ921607277" }));
    await syncSpotifyLibrary(users[0].id, connection, 1);
    expect((await metadataOf()).isrc).toBe("JPZ921607277");

    api.getMySavedTracks.mockResolvedValueOnce(saved(undefined));
    await syncSpotifyLibrary(users[0].id, connection, 1);
    expect(await metadataOf()).toMatchObject({ isrc: "JPZ921607277", album: "OST", provider: "spotify" });

    api.getMySavedTracks.mockResolvedValueOnce(saved({ isrc: "JPZ921600001" }));
    await syncSpotifyLibrary(users[0].id, connection, 1);
    expect((await metadataOf()).isrc).toBe("JPZ921600001");
  });
});

// L'expression partagee par les 5 upserts du compte Spotify connecte.
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
