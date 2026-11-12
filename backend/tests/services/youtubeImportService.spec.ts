// Import d'une playlist YouTube : lecture du lien, lecture de la playlist sur
// une fausse API YouTube (127.0.0.1, comme le faux Deezer de la pile), et
// recherche des morceaux chez Deezer (simule) sous les bornes de l'import.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import http from "node:http";
import type { AddressInfo } from "node:net";

jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { logger } from "../../src/utils/logger";
import { deezerPreviewService, type DeezerTrack, type PreviewOutcome } from "../../src/services/deezerPreviewService";
import {
  YOUTUBE_LIMITS,
  YoutubeImportError,
  clearYoutubeCache,
  examinedFor,
  fetchYoutubePlaylistInfo,
  fetchYoutubeVideos,
  matchYoutubeVideos,
  resetYoutubePacer,
  youtubePlaylistId,
} from "../../src/services/youtubeImportService";
import { parseProfileLink, parseProfileUrl } from "../../src/services/profileImportService";
import { normalizeLinkUrl } from "../../src/controllers/linksController";

const DEFAULTS = { ...YOUTUBE_LIMITS };

// ---------------------------------------------------------------------------
// Fausse API YouTube
// ---------------------------------------------------------------------------

type Reply = { status: number; body: unknown };
let routes: Record<string, (q: URLSearchParams) => Reply> = {};
const calls: string[] = [];
let server: http.Server;
const saved = { base: process.env.YOUTUBE_API_BASE, key: process.env.YOUTUBE_API_KEY };

const videos = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ snippet: { title: `Artiste ${from + i} - Titre ${from + i} (Clip officiel)`, videoOwnerChannelTitle: `Artiste ${from + i}` } }));

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    calls.push(`${url.pathname}?${url.searchParams.toString()}`);
    const route = routes[url.pathname];
    const reply = route ? route(url.searchParams) : { status: 404, body: { error: { code: 404, errors: [{ reason: "notFound" }] } } };
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
  routes = {};
  calls.length = 0;
  clearYoutubeCache();
  resetYoutubePacer();
  Object.assign(YOUTUBE_LIMITS, DEFAULTS, { minGapMs: 0 });
  (logger.error as jest.Mock).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.assign(YOUTUBE_LIMITS, DEFAULTS);
});

// ---------------------------------------------------------------------------
// Lien
// ---------------------------------------------------------------------------

describe("youtubePlaylistId", () => {
  const id = (raw: string) => youtubePlaylistId(new URL(raw));
  it.each([
    ["https://www.youtube.com/playlist?list=PLZt2YpN30WNWSgtys4Uif2zjXnY29Yj3N", "PLZt2YpN30WNWSgtys4Uif2zjXnY29Yj3N"],
    ["https://youtube.com/playlist?list=PL43DjR6QvKGFVjTXj3oAzWHzAlybXaLr4&si=AbCdEf123", "PL43DjR6QvKGFVjTXj3oAzWHzAlybXaLr4"],
    ["https://m.youtube.com/playlist?list=PLabc_-123", "PLabc_-123"],
    ["https://music.youtube.com/playlist?list=OLAK5uy_kXyz123&si=zz", "OLAK5uy_kXyz123"],
    ["https://music.youtube.com/browse/VLPLabcdef123", "PLabcdef123"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz789", "PLxyz789"],
    ["https://youtu.be/dQw4w9WgXcQ?list=PLxyz789&si=share", "PLxyz789"],
  ])("%s", (raw, expected) => {
    expect(id(raw)).toBe(expected);
  });

  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/@orelsan",
    "https://www.youtube.com/playlist?list=<script>",
    "https://youtube.com.evil.com/playlist?list=PLx",
    "https://notyoutube.com/playlist?list=PLx",
  ])("pas une playlist : %s", raw => {
    expect(id(raw)).toBeNull();
  });
});

describe("parseProfileUrl / parseProfileLink (YouTube)", () => {
  it("une playlist YouTube est reconnue, une video seule non", () => {
    expect(parseProfileUrl("https://www.youtube.com/playlist?list=PLabc")).toEqual({ provider: "youtube", type: "playlist", id: "PLabc" });
    expect(parseProfileUrl("https://youtu.be/dQw4w9WgXcQ")).toBeNull();
  });

  it("garde l'adresse de la liste seule, sans la video ni le ?si= du partage", async () => {
    await expect(parseProfileLink("https://youtu.be/dQw4w9WgXcQ?list=PLabc&si=x"))
      .resolves.toEqual({ parsed: { provider: "youtube", type: "playlist", id: "PLabc" }, url: "https://www.youtube.com/playlist?list=PLabc" });
    await expect(parseProfileLink("https://music.youtube.com/playlist?list=OLAK5uy_x&si=y"))
      .resolves.toMatchObject({ url: "https://music.youtube.com/playlist?list=OLAK5uy_x" });
  });

  it("deux playlists YouTube d'un joueur font deux cartes ; YouTube et YouTube Music, une seule", () => {
    expect(normalizeLinkUrl("https://www.youtube.com/playlist?list=PLaaa")).not.toBe(normalizeLinkUrl("https://www.youtube.com/playlist?list=PLbbb"));
    expect(normalizeLinkUrl("https://music.youtube.com/playlist?list=PLaaa")).toBe(normalizeLinkUrl("https://www.youtube.com/playlist?list=PLaaa"));
    // Les autres liens gardent leur forme d'avant.
    expect(normalizeLinkUrl("https://www.deezer.com/fr/playlist/42?utm=x")).toBe("deezer.com/fr/playlist/42");
  });
});

// ---------------------------------------------------------------------------
// Lecture de la playlist
// ---------------------------------------------------------------------------

describe("fetchYoutubePlaylistInfo", () => {
  it("nom, nombre de videos et image ; la cle part, jamais un champ en trop", async () => {
    routes["/playlists"] = () => ({ status: 200, body: { items: [{ id: "PLabc", snippet: { title: "Rap FR", thumbnails: { medium: { url: "https://i.ytimg.com/x.jpg" } } }, contentDetails: { itemCount: 42 } }] } });
    await expect(fetchYoutubePlaylistInfo("PLabc")).resolves.toEqual({ id: "PLabc", name: "Rap FR", itemCount: 42, cover: "https://i.ytimg.com/x.jpg" });
    expect(calls[0]).toContain("key=cle-de-test");
    expect(calls[0]).toContain("id=PLabc");
  });

  it("privee ou introuvable (YouTube ne dit pas laquelle) : introuvable", async () => {
    routes["/playlists"] = () => ({ status: 200, body: { items: [] } });
    await expect(fetchYoutubePlaylistInfo("PLprive")).rejects.toMatchObject({ code: "youtube_not_found", status: 404 });
  });

  it("vide : message clair", async () => {
    routes["/playlists"] = () => ({ status: 200, body: { items: [{ id: "PLvide", snippet: { title: "x" }, contentDetails: { itemCount: 0 } }] } });
    await expect(fetchYoutubePlaylistInfo("PLvide")).rejects.toMatchObject({ code: "youtube_empty" });
  });

  it("J'aime, A regarder plus tard : privees sans appeler YouTube ; un mix : refuse", async () => {
    for (const id of ["LL", "LM", "WL"]) await expect(fetchYoutubePlaylistInfo(id)).rejects.toMatchObject({ code: "youtube_private" });
    await expect(fetchYoutubePlaylistInfo("RDdQw4w9WgXcQ")).rejects.toMatchObject({ code: "youtube_mix" });
    expect(calls).toHaveLength(0);
  });

  it("sans cle : indisponible, sans appel", async () => {
    delete process.env.YOUTUBE_API_KEY;
    await expect(fetchYoutubePlaylistInfo("PLabc")).rejects.toMatchObject({ code: "youtube_unavailable", status: 503 });
    expect(calls).toHaveLength(0);
  });

  it("quota depasse ou cle refusee : indisponible, et la cle n'apparait pas dans le journal", async () => {
    routes["/playlists"] = () => ({ status: 403, body: { error: { code: 403, errors: [{ reason: "quotaExceeded" }] } } });
    await expect(fetchYoutubePlaylistInfo("PLabc")).rejects.toMatchObject({ code: "youtube_unavailable" });
    const logged = JSON.stringify((logger.error as jest.Mock).mock.calls);
    expect(logged).toContain("quotaExceeded");
    expect(logged).not.toContain("cle-de-test");
  });
});

describe("fetchYoutubeVideos", () => {
  it("toutes les pages, la chaine de la video (pas celle du proprietaire), videos supprimees sautees", async () => {
    routes["/playlistItems"] = q => q.get("pageToken") === "p2"
      ? { status: 200, body: { items: [{ snippet: { title: "Deleted video" } }, { snippet: { title: "Private video" } }, ...videos(2, 50)] } }
      : { status: 200, body: { nextPageToken: "p2", items: videos(50) } };
    const list = await fetchYoutubeVideos("PLabc");
    expect(list).toHaveLength(52);
    expect(list[0]).toEqual({ title: "Artiste 0 - Titre 0 (Clip officiel)", channel: "Artiste 0" });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("maxResults=50");
  });

  it("s'arrete a maxItems videos lues", async () => {
    YOUTUBE_LIMITS.maxItems = 100;
    routes["/playlistItems"] = q => ({ status: 200, body: { nextPageToken: `p${Number(q.get("pageToken")?.slice(1) ?? 1) + 1}`, items: videos(50) } });
    await fetchYoutubeVideos("PLlong");
    expect(calls).toHaveLength(2);
  });

  it("garde la liste 10 min : un second import ne rappelle pas YouTube", async () => {
    routes["/playlistItems"] = () => ({ status: 200, body: { items: videos(3) } });
    await fetchYoutubeVideos("PLcache");
    await fetchYoutubeVideos("PLcache");
    expect(calls).toHaveLength(1);
  });

  it("playlist privee (403 playlistItemsNotAccessible) et introuvable (404)", async () => {
    routes["/playlistItems"] = q => q.get("playlistId") === "PLprive"
      ? { status: 403, body: { error: { code: 403, errors: [{ reason: "playlistItemsNotAccessible" }] } } }
      : { status: 404, body: { error: { code: 404, errors: [{ reason: "playlistNotFound" }] } } };
    await expect(fetchYoutubeVideos("PLprive")).rejects.toMatchObject({ code: "youtube_private", status: 403 });
    await expect(fetchYoutubeVideos("PLnulle")).rejects.toMatchObject({ code: "youtube_not_found" });
  });

  it("que des videos supprimees : vide", async () => {
    routes["/playlistItems"] = () => ({ status: 200, body: { items: [{ snippet: { title: "Deleted video" } }] } });
    await expect(fetchYoutubeVideos("PLmorte")).rejects.toBeInstanceOf(YoutubeImportError);
  });

  it("API muette : indisponible apres le delai de page", async () => {
    YOUTUBE_LIMITS.pageTimeoutMs = 100;
    routes = {};
    const silent = http.createServer(() => { /* ne repond jamais */ });
    await new Promise<void>(r => silent.listen(0, "127.0.0.1", r));
    const base = process.env.YOUTUBE_API_BASE;
    process.env.YOUTUBE_API_BASE = `http://127.0.0.1:${(silent.address() as AddressInfo).port}`;
    try {
      await expect(fetchYoutubeVideos("PLlent")).rejects.toMatchObject({ code: "youtube_unavailable" });
    } finally {
      process.env.YOUTUBE_API_BASE = base;
      silent.closeAllConnections();
      await new Promise(r => silent.close(r));
    }
  });
});

// ---------------------------------------------------------------------------
// Retrouver chez Deezer
// ---------------------------------------------------------------------------

const deezer = (id: number, title = `Titre ${id}`): DeezerTrack => ({ id, title, artist: `Artiste ${id}`, preview: `https://cdn/${id}.mp3`, albumCover: null, duration: 200 });
const vids = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Artiste ${i} - Titre ${i}`, channel: `Artiste ${i}` }));

function stubDeezer(answer: (title: string, artist?: string) => PreviewOutcome | Promise<PreviewOutcome>) {
  return jest.spyOn(deezerPreviewService, "resolvePreviewOutcome").mockImplementation(async q => answer(q.title, q.artist));
}

describe("matchYoutubeVideos", () => {
  it("compte retrouves et non retrouves, sans doublon", async () => {
    stubDeezer(title => {
      const n = Number(title.split(" ")[1]);
      if (n % 5 === 4) return { status: "none" };
      return { status: "found", track: deezer(n === 1 ? 0 : n) }; // la video 1 retombe sur le morceau 0
    });
    const { tracks, report } = await matchYoutubeVideos(vids(10), 10);
    expect(report).toEqual({ playlistSize: 10, examined: 10, found: 8, notFound: 2, unchecked: 0, stoppedBy: null });
    expect(tracks.map(t => t.id)).toEqual([0, 2, 3, 5, 6, 7, 8]);
  });

  it("ne regarde que les premieres videos demandees", async () => {
    const spy = stubDeezer(() => ({ status: "found", track: deezer(1) }));
    const { report } = await matchYoutubeVideos(vids(30), 5);
    expect(report.examined).toBe(5);
    expect(report.playlistSize).toBe(30);
    expect(spy).toHaveBeenCalledTimes(5);
  });

  it("deuxieme recherche (a l'envers) quand la premiere ne trouve rien", async () => {
    const spy = stubDeezer((title, artist) => (artist === "Indochine" ? { status: "found", track: deezer(9, title) } : { status: "none" }));
    const { report } = await matchYoutubeVideos([{ title: "Trois nuits par semaine - Indochine", channel: "metaleuse80" }], 1);
    expect(report.found).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("Deezer en erreur : disjoncteur apres 6 echecs de suite, le reste n'est pas verifie (pas compte absent)", async () => {
    const spy = stubDeezer(() => ({ status: "error" }));
    const { tracks, report } = await matchYoutubeVideos(vids(20), 20);
    expect(tracks).toEqual([]);
    expect(report.notFound).toBe(0);
    expect(report.unchecked).toBe(20);
    expect(report.stoppedBy).toBe("breaker");
    expect(spy.mock.calls.length).toBeLessThanOrEqual(YOUTUBE_LIMITS.breakerFailures + YOUTUBE_LIMITS.workers);
  });

  it("Deezer muet : chaque recherche abandonnee a son delai, l'import s'arrete a l'echeance", async () => {
    Object.assign(YOUTUBE_LIMITS, { deadlineMs: 300, lookupTimeoutMs: 100, breakerFailures: 1_000 });
    stubDeezer(() => new Promise<PreviewOutcome>(() => { /* jamais */ }));
    const started = Date.now();
    const { report } = await matchYoutubeVideos(vids(50), 50);
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(report.found).toBe(0);
    expect(report.unchecked).toBe(50);
    expect(report.stoppedBy).toBe("deadline");
  });

  it("debit plafonne : une recherche tous les minGapMs, tous imports confondus", async () => {
    YOUTUBE_LIMITS.minGapMs = 40;
    const starts: number[] = [];
    stubDeezer(() => { starts.push(Date.now()); return { status: "none" }; });
    await Promise.all([matchYoutubeVideos(vids(3).map(v => ({ ...v, channel: "Artiste Officiel" })), 3), matchYoutubeVideos(vids(3), 3)]);
    starts.sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(30);
  });

  it("examinedFor : au moins 50 videos, au plus 100", () => {
    expect(examinedFor(undefined)).toBe(50);
    expect(examinedFor(10)).toBe(50);
    expect(examinedFor(80)).toBe(80);
    expect(examinedFor(500)).toBe(100);
    expect(examinedFor(Number.NaN)).toBe(50);
  });
});
