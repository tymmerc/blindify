/**
 * Import d'une playlist YouTube contre une vraie base de test : la fausse API
 * YouTube ecoute sur 127.0.0.1, Deezer est simule. On verifie ce qui reste en
 * base : des morceaux Deezer relies au joueur et a sa carte, rien de YouTube
 * (ni titre de video, ni nom de playlist), et une carte par playlist.
 *
 * Base : TEST_DATABASE_URL (voir tests/testDatabase.ts), jamais la prod.
 */
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../src/utils/session", () => ({
  ...jest.requireActual("../../src/utils/session"),
  getSessionContext: jest.fn(),
}));

import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response } from "express";
import { resolveTestDatabaseUrl } from "../testDatabase";
import { pool, seedUsers, cleanupUsers, closePool, type TestUser } from "./helpers/socket-test-harness";
import { getSessionContext } from "../../src/utils/session";
import { importController } from "../../src/controllers/importController";
import { deezerPreviewService, type DeezerTrack } from "../../src/services/deezerPreviewService";
import { YOUTUBE_LIMITS, clearYoutubeCache, resetYoutubePacer } from "../../src/services/youtubeImportService";

resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);

const DEEZER_IDS = ["990000001", "990000002"];
let users: TestUser[] = [];
let server: http.Server;
const saved = { base: process.env.YOUTUBE_API_BASE, key: process.env.YOUTUBE_API_KEY, gap: YOUTUBE_LIMITS.minGapMs };

type Body = { success: boolean; data?: any; error?: { code: string; message: string } };
function fakeRes() {
  const res = { statusCode: 200, body: undefined as unknown } as { statusCode: number; body: unknown } & Partial<Response>;
  res.status = ((code: number) => { res.statusCode = code; return res; }) as Response["status"];
  res.json = ((body: unknown) => { res.body = body; return res; }) as Response["json"];
  return res as unknown as Response & { statusCode: number; body: Body };
}
const req = (body: unknown) => ({ body, ip: "203.0.113.10", headers: {} }) as unknown as Request;

beforeAll(async () => {
  users = await seedUsers(1, "Yt");
  server = http.createServer((r, res) => {
    const url = new URL(r.url ?? "/", "http://x");
    const body = url.pathname === "/playlists"
      ? { items: [{ id: url.searchParams.get("id"), snippet: { title: "Nom YouTube a ne pas garder" }, contentDetails: { itemCount: 3 } }] }
      : { items: [
        { snippet: { title: "IAM - Demain c'est loin (Clip officiel)", videoOwnerChannelTitle: "IAM Officiel" } },
        { snippet: { title: "Madonna - Like A Prayer (Official Video)", videoOwnerChannelTitle: "Madonna" } },
        { snippet: { title: "Personne - Rien du tout", videoOwnerChannelTitle: "x" } },
      ] };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  process.env.YOUTUBE_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.YOUTUBE_API_KEY = "cle-de-test";
  YOUTUBE_LIMITS.minGapMs = 0;
  (getSessionContext as jest.Mock).mockImplementation(async () => ({ user: { id: users[0].id } }));
  const known: Record<string, DeezerTrack> = {
    "Demain c'est loin": { id: Number(DEEZER_IDS[0]), title: "Demain, c'est loin", artist: "IAM", preview: null, albumCover: "https://cdn/a.jpg", duration: 545 },
    "Like A Prayer": { id: Number(DEEZER_IDS[1]), title: "Like a Prayer", artist: "Madonna", preview: null, albumCover: null, duration: 340 },
  };
  jest.spyOn(deezerPreviewService, "resolvePreviewOutcome").mockImplementation(async q => (known[q.title] ? { status: "found", track: known[q.title] } : { status: "none" }));
  // L'avance d'extraits apres l'import (en tache de fond) ne sort pas du test.
  jest.spyOn(deezerPreviewService, "resolvePreview").mockResolvedValue(null);
});

afterAll(async () => {
  jest.restoreAllMocks();
  YOUTUBE_LIMITS.minGapMs = saved.gap;
  for (const [k, v] of [["YOUTUBE_API_BASE", saved.base], ["YOUTUBE_API_KEY", saved.key]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  if (server) {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
  await pool.query("DELETE FROM imported_links WHERE user_id = ANY($1::int[])", [users.map(u => u.id)]);
  await pool.query("DELETE FROM audio_sources WHERE provider = 'deezer' AND external_id = ANY($1::text[])", [DEEZER_IDS]);
  await cleanupUsers(users);
  await closePool();
});

beforeEach(() => {
  clearYoutubeCache();
  resetYoutubePacer();
});

async function importLink(url: string): Promise<{ linkId: number; sync: Body }> {
  const listRes = fakeRes();
  await importController.playlists(req({ url }), listRes);
  expect(listRes.statusCode).toBe(200);
  const { linkId, playlists, provider } = listRes.body.data;
  const syncRes = fakeRes();
  await importController.syncAll(req({ provider, playlistIds: playlists.map((p: { id: string }) => p.id), maxTracksPerPlaylist: 10, linkId }), syncRes);
  return { linkId, sync: syncRes.body };
}

describe("import YouTube en base", () => {
  it("les morceaux Deezer retrouves sont au joueur, sur sa carte « Playlist YouTube »", async () => {
    const { linkId, sync } = await importLink("https://youtu.be/abc?list=PLyoutubeA&si=partage");
    expect(sync.data).toMatchObject({ synced: 2, youtube: { examined: 3, found: 2, notFound: 1 } });

    const { rows: tracks } = await pool.query(
      `SELECT a.provider, a.external_id, a.title, a.metadata->>'import_source' AS source, ua.link_id
       FROM user_audio_sources ua JOIN audio_sources a ON a.id = ua.audio_source_id
       WHERE ua.user_id = $1 ORDER BY a.external_id`,
      [users[0].id],
    );
    expect(tracks).toEqual([
      { provider: "deezer", external_id: DEEZER_IDS[0], title: "Demain, c'est loin", source: "youtube", link_id: linkId },
      { provider: "deezer", external_id: DEEZER_IDS[1], title: "Like a Prayer", source: "youtube", link_id: linkId },
    ]);

    const { rows: links } = await pool.query("SELECT url, normalized_url, provider, label, image_url FROM imported_links WHERE id = $1", [linkId]);
    expect(links[0]).toEqual({
      url: "https://www.youtube.com/playlist?list=PLyoutubeA",
      normalized_url: "youtube.com/playlist?list=PLyoutubeA",
      provider: "youtube",
      label: "Playlist YouTube",
      image_url: null,
    });
  });

  it("une seconde playlist fait une seconde carte ; la meme par YouTube Music, non", async () => {
    const first = await pool.query("SELECT id FROM imported_links WHERE user_id = $1 AND provider = 'youtube'", [users[0].id]);
    await importLink("https://www.youtube.com/playlist?list=PLyoutubeB");
    await importLink("https://music.youtube.com/playlist?list=PLyoutubeB");
    const { rows } = await pool.query("SELECT normalized_url FROM imported_links WHERE user_id = $1 AND provider = 'youtube' ORDER BY id", [users[0].id]);
    expect(first.rows).toHaveLength(1);
    expect(rows.map(r => r.normalized_url)).toEqual(["youtube.com/playlist?list=PLyoutubeA", "youtube.com/playlist?list=PLyoutubeB"]);
  });

  it("rien de YouTube en base : ni le nom de la playlist, ni les titres des videos", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM imported_links WHERE user_id = $1 AND label ILIKE '%Nom YouTube%'`,
      [users[0].id],
    );
    expect(rows[0].n).toBe(0);
    const { rows: titles } = await pool.query(
      `SELECT count(*)::int AS n FROM audio_sources WHERE title ILIKE '%Clip officiel%' OR title ILIKE '%Official Video%'`,
    );
    expect(titles[0].n).toBe(0);
  });
});
