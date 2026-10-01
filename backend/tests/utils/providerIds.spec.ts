import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { Request, Response } from "express";

// Base, session et reseau sont simules : aucun test de ce fichier ne sort de la
// machine ni ne touche une base.
jest.mock("../../src/config/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("../../src/utils/session", () => ({ getSessionContext: jest.fn() }));
jest.mock("../../src/services/trackResolution", () => ({
  hydratePreviewUrl: jest.fn(),
  collectPlayableSources: jest.fn(),
  shuffle: jest.fn(),
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("axios");

import axios from "axios";
import { pool } from "../../src/config/db";
import { getSessionContext } from "../../src/utils/session";
import { DEEZER_API } from "../../src/config/deezer";
import { SPOTIFY_ID_RE, DEEZER_ID_RE, isSpotifyId, isDeezerId } from "../../src/utils/providerIds";
import { parseProfileUrl, fetchPublicPlaylists } from "../../src/services/profileImportService";
import { gamesController } from "../../src/controllers/gamesController";
import { roomsController } from "../../src/controllers/roomsController";

type AsyncMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockQuery = pool.query as unknown as AsyncMock;
const mockGetSessionContext = getSessionContext as unknown as AsyncMock;
const mockAxiosGet = (axios as unknown as { get: AsyncMock }).get;

// Vrai id de playlist Spotify (22 caracteres base62).
const SPOTIFY_PLAYLIST = "37i9dQZF1DXcBWIGoYBM5M";
const TRAVERSAL = "../../../../me";

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return { body: {}, query: {}, params: {}, headers: {}, session: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.setHeader.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

function spotifyContext() {
  return {
    user: { id: 1, provider: "local", provider_id: "u1", username: "hote", email: null, avatar: null },
    connection: { id: 10, user_id: 1, provider: "spotify", access_token: "jeton-test" },
    sessionToken: "tok",
  };
}

function requestedUrls(): string[] {
  return mockAxiosGet.mock.calls.map(call => String(call[0]));
}

// Hote exact, pas un prefixe de chaine : "https://api.spotify.com.autre.site"
// commence aussi par "https://api.spotify.com" (motif que CodeQL signale).
function isSpotifyApi(url: unknown): boolean {
  try {
    return new URL(String(url)).host === "api.spotify.com";
  } catch {
    return false;
  }
}

beforeEach(() => {
  mockQuery.mockReset();
  mockGetSessionContext.mockReset();
  mockAxiosGet.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  // Fin de pagination Spotify immediate, reponse vide ailleurs (iTunes...).
  mockAxiosGet.mockImplementation(async (url: unknown) =>
    isSpotifyApi(url)
      ? { data: { items: [], next: null } }
      : { data: {} }
  );
});

// ---------------------------------------------------------------------------
// Constantes de format
// ---------------------------------------------------------------------------

describe("SPOTIFY_ID_RE / isSpotifyId", () => {
  it("accepte un id Spotify reel (22 caracteres base62)", () => {
    expect(SPOTIFY_ID_RE.test(SPOTIFY_PLAYLIST)).toBe(true);
    expect(isSpotifyId(SPOTIFY_PLAYLIST)).toBe(true);
    expect(isSpotifyId("0123456789abcdefABCDEF")).toBe(true);
  });

  it.each([
    ["vide", ""],
    ["21 caracteres", SPOTIFY_PLAYLIST.slice(1)],
    ["23 caracteres", `${SPOTIFY_PLAYLIST}a`],
    ["parcours de chemin", TRAVERSAL],
    ["id suivi d'un parcours", `${SPOTIFY_PLAYLIST}/../me`],
    ["query et fragment injectes", "x?market=FR#"],
    ["id ancien format du test existant", "pl-123"],
    ["URI spotify:", `spotify:playlist:${SPOTIFY_PLAYLIST}`],
    ["URL complete", `https://open.spotify.com/playlist/${SPOTIFY_PLAYLIST}`],
    ["retour a la ligne final", `${SPOTIFY_PLAYLIST}\n`],
    ["id encode", "%2E%2E%2F%2E%2E%2Fme0000000"],
  ])("refuse %s", (_label, value) => {
    expect(isSpotifyId(value)).toBe(false);
  });

  it.each([[null], [undefined], [123], [{}], [[SPOTIFY_PLAYLIST]]])("refuse une valeur non texte (%p)", value => {
    expect(isSpotifyId(value)).toBe(false);
  });
});

describe("DEEZER_ID_RE / isDeezerId", () => {
  it.each([["1109890291"], ["2529"], ["1"]])("accepte l'id numerique %s", value => {
    expect(DEEZER_ID_RE.test(value)).toBe(true);
    expect(isDeezerId(value)).toBe(true);
  });

  it.each([
    ["vide", ""],
    ["lettres", "12a"],
    ["negatif", "-1"],
    ["decimal", "1.5"],
    ["exposant", "1e5"],
    ["antislashs", "a\\..\\..\\user\\5"],
    ["slashs encodes", "..%2f..%2fuser%2f5"],
    ["hote injecte", "@127.0.0.1:5432"],
    ["21 chiffres", "1".repeat(21)],
    ["espace initial", " 123"],
    ["retour a la ligne final", "123\n"],
  ])("refuse %s", (_label, value) => {
    expect(isDeezerId(value)).toBe(false);
  });

  it.each([[null], [undefined], [1109890291], [{}]])("refuse une valeur non texte (%p)", value => {
    expect(isDeezerId(value)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Validation a l'entree : parseProfileUrl (POST /api/quick-play, /api/import/playlists)
// ---------------------------------------------------------------------------

describe("parseProfileUrl", () => {
  it.each([
    ["https://www.deezer.com/fr/playlist/1109890291", { provider: "deezer", type: "playlist", id: "1109890291" }],
    ["https://deezer.com/playlist/1", { provider: "deezer", type: "playlist", id: "1" }],
    ["http://www.deezer.com/playlist/1", { provider: "deezer", type: "playlist", id: "1" }],
    ["https://www.deezer.com/fr/profile/2529", { provider: "deezer", type: "user", id: "2529" }],
    [
      `https://open.spotify.com/playlist/${SPOTIFY_PLAYLIST}?si=abc`,
      { provider: "spotify", type: "playlist", id: SPOTIFY_PLAYLIST },
    ],
    ["https://open.spotify.com/user/spotify", { provider: "spotify", type: "user", id: "spotify" }],
  ])("accepte %s", (raw, expected) => {
    expect(parseProfileUrl(raw)).toEqual(expected);
  });

  it.each([
    ["schema non special et antislashs", "x://deezer.com/playlist/a\\..\\..\\user\\5"],
    ["schema javascript", "javascript://deezer.com/playlist/1\\..\\..\\oauth"],
    ["schema ftp", "ftp://deezer.com/playlist/9"],
    ["hote injecte dans l'id Deezer", "https://deezer.com/playlist/@127.0.0.1:5432"],
    ["slashs encodes dans l'id Deezer", "https://deezer.com/playlist/..%2f..%2fuser%2f5"],
    ["profil Deezer non numerique", "https://deezer.com/profile/abc"],
    ["slashs encodes dans l'id Spotify", "https://open.spotify.com/playlist/..%2F..%2Fme"],
    ["id de playlist Spotify mal forme", "https://open.spotify.com/playlist/pl-123"],
  ])("refuse %s", (_label, raw) => {
    expect(parseProfileUrl(raw)).toBeNull();
  });

  it.each([
    ["playlist", "https://open.spotify.com/playlist/%E0%A4%A"],
    ["profil", "https://open.spotify.com/user/%E0%A4%A"],
  ])("refuse un %s Spotify a l'encodage casse sans lever d'exception", (_label, raw) => {
    expect(() => parseProfileUrl(raw)).not.toThrow();
    expect(parseProfileUrl(raw)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Encodage dans l'URL sortante (alerte CodeQL 4)
// ---------------------------------------------------------------------------

describe("fetchPublicPlaylists, playlist Deezer", () => {
  it("interroge l'API Deezer avec l'id numerique", async () => {
    mockAxiosGet.mockResolvedValueOnce({
      data: { id: 1109890291, title: "Ma playlist", nb_tracks: 3, picture_medium: null },
    });

    const result = await fetchPublicPlaylists({ provider: "deezer", type: "playlist", id: "1109890291" });

    expect(requestedUrls()).toEqual([`${DEEZER_API}/playlist/1109890291`]);
    expect(result).toEqual([{ id: "1109890291", name: "Ma playlist", trackCount: 3, cover: null }]);
  });

  it("encode l'id meme s'il n'est pas passe par parseProfileUrl", async () => {
    await fetchPublicPlaylists({ provider: "deezer", type: "playlist", id: "1/../../user/5" });

    expect(requestedUrls()).toEqual([`${DEEZER_API}/playlist/1%2F..%2F..%2Fuser%2F5`]);
  });
});

// ---------------------------------------------------------------------------
// Controleurs : playlistId Spotify venu du body (alertes CodeQL 2 et 3)
// ---------------------------------------------------------------------------

describe("gamesController.startSoloGame, playlistId Spotify", () => {
  it("ignore un playlistId mal forme : aucune requete vers l'API Spotify", async () => {
    mockGetSessionContext.mockResolvedValue(spotifyContext());
    const req = mockReq({ body: { source: "library", provider: "spotify", playlistId: TRAVERSAL, count: 10 } });

    await gamesController.startSoloGame(req, mockRes());

    expect(requestedUrls().filter(isSpotifyApi)).toEqual([]);
  });

  it("synchronise une playlist a l'id valide, encode dans l'URL", async () => {
    mockGetSessionContext.mockResolvedValue(spotifyContext());
    const req = mockReq({
      body: { source: "library", provider: "spotify", playlistId: ` ${SPOTIFY_PLAYLIST} `, count: 10 },
    });

    await gamesController.startSoloGame(req, mockRes());

    expect(requestedUrls()).toContain(`https://api.spotify.com/v1/playlists/${SPOTIFY_PLAYLIST}/tracks?limit=100`);
  });
});

describe("roomsController.startGame, playlistId Spotify", () => {
  const room = {
    id: 5,
    room_code: "ABCDEF",
    host_user_id: 1,
    status: "waiting",
    max_players: 8,
    question_count: 10,
    difficulty: "normal",
    mode: "friends",
    host_plays: false,
    auto_advance: false,
    session_id: null,
    round_duration_ms: null,
  };

  it("refuse un playlistId mal forme en 400, avant toute requete", async () => {
    mockGetSessionContext.mockResolvedValue(spotifyContext());
    const req = mockReq({ params: { code: "abcdef" }, body: { provider: "spotify", playlistId: TRAVERSAL } });
    const res = mockRes();

    await roomsController.startGame(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ code: "invalid_playlist" }) })
    );
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it("laisse passer un playlistId vide (pas de playlist demandee)", async () => {
    mockGetSessionContext.mockResolvedValue(spotifyContext());
    const req = mockReq({ params: { code: "abcdef" }, body: { provider: "spotify", playlistId: "   " } });
    const res = mockRes();

    await roomsController.startGame(req, res);

    // Salle absente de la base simulee : on va donc plus loin que la validation.
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("synchronise une playlist a l'id valide, encode dans l'URL", async () => {
    mockGetSessionContext.mockResolvedValue(spotifyContext());
    mockQuery.mockImplementation(async (sql: unknown) =>
      String(sql).includes("FROM multiplayer_rooms") ? { rows: [room], rowCount: 1 } : { rows: [], rowCount: 0 }
    );
    const req = mockReq({ params: { code: "abcdef" }, body: { provider: "spotify", playlistId: SPOTIFY_PLAYLIST } });

    await roomsController.startGame(req, mockRes());

    expect(requestedUrls()).toEqual([`https://api.spotify.com/v1/playlists/${SPOTIFY_PLAYLIST}/tracks?limit=100`]);
  });
});
