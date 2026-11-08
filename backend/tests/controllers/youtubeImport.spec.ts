// Import d'une playlist YouTube de bout en bout dans le backend : la fausse API
// YouTube ecoute sur 127.0.0.1, Deezer et la base sont simules. On verifie ce
// que voit le joueur (compte rendu, messages) et ce qui part en base.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { NextFunction, Request, Response } from "express";
import { EventEmitter } from "node:events";

jest.mock("../../src/config/db", () => ({ pool: { query: jest.fn(async () => ({ rows: [] })) } }));
jest.mock("../../src/utils/session", () => ({ getSessionContext: jest.fn() }));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../src/controllers/linksController", () => ({
  ...(jest.requireActual("../../src/controllers/linksController") as Record<string, unknown>),
  upsertLink: jest.fn(async () => 7),
  claimLegacyTracks: jest.fn(async () => undefined),
  ownLinkId: jest.fn(async () => 7),
}));

import { pool } from "../../src/config/db";
import { getSessionContext } from "../../src/utils/session";
import { upsertLink } from "../../src/controllers/linksController";
import { importController } from "../../src/controllers/importController";
import { quickPlayController } from "../../src/controllers/quickPlayController";
import { deezerPreviewService, type DeezerTrack } from "../../src/services/deezerPreviewService";
import { YOUTUBE_LIMITS, clearYoutubeCache, resetYoutubePacer } from "../../src/services/youtubeImportService";
import { isYoutubeRequest, youtubeOneAtATime } from "../../src/middleware/youtubeLimiter";

const DEFAULTS = { ...YOUTUBE_LIMITS };
type Reply = { status: number; body: unknown };
let routes: Record<string, (q: URLSearchParams) => Reply> = {};
let server: http.Server;
const saved = { base: process.env.YOUTUBE_API_BASE, key: process.env.YOUTUBE_API_KEY };

const items = (titles: string[]) => ({ items: titles.map(t => ({ snippet: { title: t, videoOwnerChannelTitle: "une chaine" } })) });
const playlist = (id: string, itemCount: number) => ({ items: [{ id, snippet: { title: "Ma playlist", thumbnails: { medium: { url: "https://i.ytimg.com/a.jpg" } } }, contentDetails: { itemCount } }] });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const reply = routes[url.pathname]?.(url.searchParams) ?? { status: 404, body: { error: { errors: [{ reason: "playlistNotFound" }] } } };
    res.writeHead(reply.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  process.env.YOUTUBE_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const [k, v] of [["YOUTUBE_API_BASE", saved.base], ["YOUTUBE_API_KEY", saved.key]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  server.closeAllConnections();
  await new Promise(r => server.close(r));
});

beforeEach(() => {
  process.env.YOUTUBE_API_KEY = "cle-de-test";
  routes = {
    "/playlists": q => ({ status: 200, body: playlist(q.get("id") ?? "", 4) }),
    "/playlistItems": () => ({ status: 200, body: items(["IAM - Demain c'est loin (Clip officiel)", "Inconnu - Introuvable", "Madonna - Like A Prayer (Official Video)", "Deleted video"]) }),
  };
  clearYoutubeCache();
  resetYoutubePacer();
  Object.assign(YOUTUBE_LIMITS, DEFAULTS, { minGapMs: 0 });
  (pool.query as jest.Mock).mockClear();
  (upsertLink as jest.Mock).mockClear();
  (getSessionContext as jest.Mock).mockImplementation(async () => ({ user: { id: 1 } }));
  const known: Record<string, DeezerTrack> = {
    "Demain c'est loin": { id: 101, title: "Demain, c'est loin", artist: "IAM", preview: "https://cdn/101.mp3", albumCover: "https://cdn/101.jpg", duration: 545 },
    "Like A Prayer": { id: 202, title: "Like a Prayer", artist: "Madonna", preview: "https://cdn/202.mp3", albumCover: null, duration: 340 },
  };
  jest.spyOn(deezerPreviewService, "resolvePreviewOutcome").mockImplementation(async q => (known[q.title] ? { status: "found", track: known[q.title] } : { status: "none" }));
  jest.spyOn(deezerPreviewService, "resolvePreview").mockImplementation(async q => ({ id: Number(q.deezerId), title: "x", artist: "y", preview: `https://cdn/${q.deezerId}.mp3`, albumCover: null, duration: 200 }));
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.assign(YOUTUBE_LIMITS, DEFAULTS);
});

type Body = { success: boolean; data?: any; error?: { code: string; message: string; details?: any } };
function fakeRes() {
  const res = { statusCode: 200, body: undefined as unknown } as { statusCode: number; body: unknown } & Partial<Response>;
  res.status = ((code: number) => { res.statusCode = code; return res; }) as Response["status"];
  res.json = ((body: unknown) => { res.body = body; return res; }) as Response["json"];
  return res as unknown as Response & { statusCode: number; body: Body };
}
/** Reponse qui sait signaler sa fin (finish, close), comme celle d'Express. */
function emitterRes() {
  const res = fakeRes() as ReturnType<typeof fakeRes> & { emit: (event: string) => boolean };
  const events = new EventEmitter();
  (res as unknown as { on: unknown }).on = (event: string, fn: () => void) => { events.on(event, fn); return res; };
  res.emit = (event: string) => events.emit(event);
  return res;
}
const req = (body: unknown) => ({ body, ip: "203.0.113.9", headers: {} }) as unknown as Request;

describe("POST /api/import/playlists (YouTube)", () => {
  it("une playlist ; la carte dit « Playlist YouTube », sans le nom ni l'image de YouTube (regle des 30 jours)", async () => {
    const res = fakeRes();
    await importController.playlists(req({ url: "https://youtu.be/abc?list=PLabc&si=x" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ provider: "youtube", type: "playlist", linkId: 7, playlists: [{ id: "PLabc", name: "Ma playlist", trackCount: 4 }] });
    expect(upsertLink).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.youtube.com/playlist?list=PLabc", provider: "youtube", kind: "playlist", label: "Playlist YouTube", imageUrl: null,
    }));
  });

  it("YouTube Music : « Playlist YouTube Music »", async () => {
    await importController.playlists(req({ url: "https://music.youtube.com/playlist?list=OLAK5uy_x" }), fakeRes());
    expect(upsertLink).toHaveBeenCalledWith(expect.objectContaining({ label: "Playlist YouTube Music" }));
  });

  it("video seule : message qui demande la playlist", async () => {
    const res = fakeRes();
    await importController.playlists(req({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatchObject({ code: "unsupported_url" });
    expect(res.body.error?.message).toContain("list=");
  });

  it.each([
    ["privee ou introuvable", "PLnulle", () => ({ status: 200, body: { items: [] } }), 404, "youtube_not_found"],
    ["vide", "PLvide", (q: URLSearchParams) => ({ status: 200, body: playlist(q.get("id") ?? "", 0) }), 422, "youtube_empty"],
    ["quota de YouTube depasse", "PLquota", () => ({ status: 403, body: { error: { errors: [{ reason: "quotaExceeded" }] } } }), 503, "youtube_unavailable"],
  ])("%s : message clair, rien d'enregistre", async (_l, id, route, status, code) => {
    routes["/playlists"] = route;
    const res = fakeRes();
    await importController.playlists(req({ url: `https://www.youtube.com/playlist?list=${id}` }), res);
    expect(res.statusCode).toBe(status);
    expect(res.body.error?.code).toBe(code);
    expect(upsertLink).not.toHaveBeenCalled();
  });

  it("mix automatique : refuse avec un message", async () => {
    const res = fakeRes();
    await importController.playlists(req({ url: "https://www.youtube.com/watch?v=abc&list=RDabc" }), res);
    expect(res.body.error?.code).toBe("youtube_mix");
  });

  it("sans cle sur le serveur : indisponible, le message propose Spotify ou Deezer", async () => {
    delete process.env.YOUTUBE_API_KEY;
    const res = fakeRes();
    await importController.playlists(req({ url: "https://www.youtube.com/playlist?list=PLabc" }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error?.message).toContain("Spotify ou Deezer");
  });
});

describe("POST /api/import/sync-all (YouTube)", () => {
  it("enregistre les morceaux Deezer retrouves et rend le compte rendu « 2 sur 3 »", async () => {
    const res = fakeRes();
    await importController.syncAll(req({ provider: "youtube", playlistIds: ["PLabc"], maxTracksPerPlaylist: 10, linkId: 7 }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ synced: 2, total: 2, youtube: { examined: 3, found: 2, notFound: 1, unchecked: 0 } });
    // En base : des morceaux Deezer (titre de Deezer), venus de YouTube ; aucun titre de video.
    const params = (pool.query as jest.Mock).mock.calls.map(c => c[1] as unknown[]).filter(p => Array.isArray(p) && p[1] === "deezer");
    expect(params.map(p => p[2])).toEqual(["101", "202"]);
    expect(params[0][3]).toBe("Demain, c'est loin");
    expect(JSON.parse(params[0][7] as string)).toMatchObject({ import_source: "youtube", playlist_id: "PLabc" });
    expect(JSON.stringify(params)).not.toContain("Clip officiel");
  });

  it("aucun morceau retrouve : 422 avec un message honnete", async () => {
    routes["/playlistItems"] = () => ({ status: 200, body: items(["A - B", "C - D"]) });
    const res = fakeRes();
    await importController.syncAll(req({ provider: "youtube", playlistIds: ["PLrien"] }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toMatchObject({ code: "youtube_none_found" });
    expect(res.body.error?.message).toContain("Aucun des 2 morceaux");
  });

  it("Deezer en panne : pas « introuvable », mais « réessaie »", async () => {
    (deezerPreviewService.resolvePreviewOutcome as jest.Mock).mockImplementation(async () => ({ status: "error" }));
    const res = fakeRes();
    await importController.syncAll(req({ provider: "youtube", playlistIds: ["PLpanne"] }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body.error?.message).toContain("Réessaie");
  });

  it("plusieurs playlists YouTube d'un coup : refuse", async () => {
    const res = fakeRes();
    await importController.syncAll(req({ provider: "youtube", playlistIds: ["PLa", "PLb"] }), res);
    expect(res.body.error?.code).toBe("too_many_playlists");
  });

  it("playlist devenue privee entre les deux appels : message clair", async () => {
    routes["/playlistItems"] = () => ({ status: 403, body: { error: { errors: [{ reason: "playlistItemsNotAccessible" }] } } });
    const res = fakeRes();
    await importController.sync(req({ provider: "youtube", playlistId: "PLprive" }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error?.code).toBe("youtube_private");
  });

  it("provider inconnu toujours refuse", async () => {
    const res = fakeRes();
    await importController.syncAll(req({ provider: "apple", playlistIds: ["x"] }), res);
    expect(res.body.error?.code).toBe("invalid_provider");
  });
});

describe("POST /api/quick-play (YouTube)", () => {
  it("playlist privee : le message de YouTube, pas une erreur 500", async () => {
    routes["/playlists"] = () => ({ status: 200, body: { items: [] } });
    const res = fakeRes();
    await quickPlayController.start(req({ url: "https://www.youtube.com/playlist?list=PLprive" }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error?.code).toBe("youtube_not_found");
  });
});

describe("limites de l'import YouTube", () => {
  it("reconnait une requete YouTube (lien ou provider), pas Spotify ni Deezer", () => {
    expect(isYoutubeRequest(req({ url: "https://music.youtube.com/playlist?list=x" }))).toBe(true);
    expect(isYoutubeRequest(req({ url: "youtu.be/abc?list=x" }))).toBe(true);
    expect(isYoutubeRequest(req({ provider: "youtube", playlistIds: ["x"] }))).toBe(true);
    expect(isYoutubeRequest(req({ url: "https://open.spotify.com/playlist/x" }))).toBe(false);
    expect(isYoutubeRequest(req({ url: "https://youtube.com.evil.com/x" }))).toBe(false);
    expect(isYoutubeRequest(req({ provider: "deezer" }))).toBe(false);
  });

  it("un seul import YouTube a la fois par IP ; la place se libere a la reponse", () => {
    const res1 = emitterRes();
    const res2 = emitterRes();
    const next = jest.fn() as unknown as NextFunction;
    youtubeOneAtATime(req({ provider: "youtube" }), res1, next);
    youtubeOneAtATime(req({ provider: "youtube" }), res2, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res2.statusCode).toBe(429);
    expect(res2.body.error?.code).toBe("youtube_busy");
    res1.emit("finish");
    const res3 = emitterRes();
    youtubeOneAtATime(req({ provider: "youtube" }), res3, next);
    expect(next).toHaveBeenCalledTimes(2);
    res3.emit("close");
    // Spotify n'est jamais retenu.
    youtubeOneAtATime(req({ provider: "spotify" }), emitterRes(), next);
    youtubeOneAtATime(req({ provider: "spotify" }), emitterRes(), next);
    expect(next).toHaveBeenCalledTimes(4);
  });
});
