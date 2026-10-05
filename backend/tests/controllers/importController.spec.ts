import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { Request, Response } from "express";

// Base, session et fournisseurs sont simules : aucun test de ce fichier ne
// sort de la machine ni ne touche une base.
jest.mock("../../src/config/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("../../src/utils/session", () => ({ getSessionContext: jest.fn() }));
jest.mock("../../src/services/profileImportService", () => ({
  parseProfileUrl: jest.fn(),
  fetchPublicPlaylists: jest.fn(),
  fetchPlaylistTracks: jest.fn(),
}));
jest.mock("../../src/controllers/linksController", () => ({
  upsertLink: jest.fn(),
  claimLegacyTracks: jest.fn(),
}));
jest.mock("../../src/services/deezerPreviewService", () => ({
  deezerPreviewService: { searchTrack: jest.fn() },
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("axios");

import { pool } from "../../src/config/db";
import { getSessionContext } from "../../src/utils/session";
import { fetchPlaylistTracks } from "../../src/services/profileImportService";
import { importController } from "../../src/controllers/importController";
import { MAX_PLAYLISTS_PER_SYNC, MAX_TRACKS_PER_PLAYLIST } from "../../src/utils/importLimits";

type AsyncMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockQuery = pool.query as unknown as AsyncMock;
const mockGetSessionContext = getSessionContext as unknown as AsyncMock;
const mockFetchTracks = fetchPlaylistTracks as unknown as AsyncMock;

function mockReq(body: unknown): Request {
  return { body, query: {}, params: {}, headers: {}, session: {} } as unknown as Request;
}

function mockRes() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.setHeader.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

function track(id: string) {
  return { title: `Titre ${id}`, artist: "Artiste", album: null, cover: null, externalId: id, provider: "deezer" as const, durationMs: 30000 };
}

interface Corps {
  success: boolean;
  data: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
}

/** Code HTTP et corps envoyes par le controleur. */
function reponse(res: ReturnType<typeof mockRes>) {
  return { status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] as Corps };
}

/** Parametres des INSERT dans audio_sources (le pre-chargement en tache de fond fait ses propres requetes). */
function insertions(): unknown[][] {
  return mockQuery.mock.calls
    .filter(call => String(call[0]).includes("INSERT INTO audio_sources"))
    .map(call => call[1] as unknown[]);
}

beforeEach(() => {
  mockQuery.mockReset();
  mockGetSessionContext.mockReset();
  mockFetchTracks.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockGetSessionContext.mockResolvedValue({ user: { id: 7, username: "joueuse" }, sessionToken: "tok" });
  mockFetchTracks.mockImplementation(async (_provider: unknown, playlistId: unknown) => [track(`t-${String(playlistId)}`)]);
});

describe("POST /api/import/sync-all", () => {
  it(`plafonne a ${MAX_TRACKS_PER_PLAYLIST} titres par playlist meme si le client en demande 500`, async () => {
    const res = mockRes();
    await importController.syncAll(mockReq({ provider: "deezer", playlistIds: ["111"], maxTracksPerPlaylist: 500 }), res);

    expect(mockFetchTracks).toHaveBeenCalledWith("deezer", "111", MAX_TRACKS_PER_PLAYLIST);
    expect(reponse(res).status).toBe(200);
  });

  it(`n'interroge pas plus de ${MAX_PLAYLISTS_PER_SYNC} playlists par requete`, async () => {
    const playlistIds = Array.from({ length: 5000 }, (_, i) => String(100000 + i));
    const res = mockRes();
    await importController.syncAll(mockReq({ provider: "deezer", playlistIds }), res);

    expect(mockFetchTracks).toHaveBeenCalledTimes(MAX_PLAYLISTS_PER_SYNC);
    expect(reponse(res).body.data).toMatchObject({ synced: MAX_PLAYLISTS_PER_SYNC, total: MAX_PLAYLISTS_PER_SYNC });
  });

  it("n'envoie aux fournisseurs que des identifiants au bon format", async () => {
    const res = mockRes();
    await importController.syncAll(mockReq({ provider: "deezer", playlistIds: ["111", "../user/5", 42, "abc"] }), res);

    expect(mockFetchTracks).toHaveBeenCalledTimes(1);
    expect(mockFetchTracks).toHaveBeenCalledWith("deezer", "111", expect.any(Number));
    expect(reponse(res).status).toBe(200);
  });

  it("refuse en 400 une liste sans aucun identifiant valide, sans appeler de fournisseur", async () => {
    const res = mockRes();
    await importController.syncAll(mockReq({ provider: "deezer", playlistIds: ["../../me", "abc"] }), res);

    expect(mockFetchTracks).not.toHaveBeenCalled();
    expect(reponse(res).status).toBe(400);
    expect(reponse(res).body.error?.code).toBe("invalid_playlist_ids");
  });

  it("une playlist en erreur n'annule pas l'import des autres", async () => {
    mockFetchTracks.mockImplementation(async (_provider: unknown, playlistId: unknown) => {
      if (playlistId === "222") throw new Error("HTTP 429");
      return [track(`t-${String(playlistId)}`)];
    });
    const res = mockRes();
    await importController.syncAll(mockReq({ provider: "deezer", playlistIds: ["111", "222", "333"] }), res);

    expect(mockFetchTracks).toHaveBeenCalledTimes(3);
    expect(reponse(res).status).toBe(200);
    expect(reponse(res).body.data).toMatchObject({ synced: 2, total: 2, failedPlaylists: 1 });
  });

  it("repond 500 quand toutes les playlists echouent", async () => {
    mockFetchTracks.mockRejectedValue(new Error("HTTP 403"));
    const res = mockRes();
    await importController.syncAll(mockReq({ provider: "deezer", playlistIds: ["111", "222"] }), res);

    expect(reponse(res).status).toBe(500);
    expect(reponse(res).body.error?.code).toBe("sync_failed");
  });

  it("repond toujours empty_playlists quand les playlists sont vides sans erreur", async () => {
    mockFetchTracks.mockResolvedValue([]);
    const res = mockRes();
    await importController.syncAll(mockReq({ provider: "deezer", playlistIds: ["111"] }), res);

    expect(reponse(res).status).toBe(400);
    expect(reponse(res).body.error?.code).toBe("empty_playlists");
  });

  it("n'ecrit pas un linkId qui n'est pas un entier positif", async () => {
    const res = mockRes();
    await importController.syncAll(mockReq({ provider: "deezer", playlistIds: ["111"], linkId: "5; DROP TABLE users" }), res);

    const lignes = insertions();
    expect(lignes).toHaveLength(1);
    expect(lignes[0][8]).toBeNull();
  });

  it("garde un linkId valide", async () => {
    const res = mockRes();
    await importController.syncAll(mockReq({ provider: "deezer", playlistIds: ["111"], linkId: 12 }), res);

    expect(insertions()[0][8]).toBe(12);
  });
});

describe("POST /api/import/sync", () => {
  it("refuse un identifiant de playlist mal forme sans appeler de fournisseur", async () => {
    const res = mockRes();
    await importController.sync(mockReq({ provider: "deezer", playlistId: "../../user/me" }), res);

    expect(mockFetchTracks).not.toHaveBeenCalled();
    expect(reponse(res).status).toBe(400);
    expect(reponse(res).body.error?.code).toBe("invalid_playlist_id");
  });

  it("accepte un identifiant Deezer valide", async () => {
    const res = mockRes();
    await importController.sync(mockReq({ provider: "deezer", playlistId: "908622995" }), res);

    expect(mockFetchTracks).toHaveBeenCalledWith("deezer", "908622995");
    expect(reponse(res).status).toBe(200);
  });
});
