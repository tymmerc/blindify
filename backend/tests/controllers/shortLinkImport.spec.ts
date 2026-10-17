import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response } from "express";

// Lien court colle a l'import et a la partie rapide, de bout en bout dans le
// backend : le faux hebergeur de liens courts ecoute sur 127.0.0.1 (comme dans
// la pile de test), les API Spotify et Deezer et la base sont simulees.
jest.mock("../../src/config/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("../../src/utils/session", () => ({ getSessionContext: jest.fn() }));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../src/controllers/linksController", () => ({
  upsertLink: jest.fn(async () => 7),
  claimLegacyTracks: jest.fn(async () => undefined),
  ownLinkId: jest.fn(),
}));
jest.mock("../../src/services/profileImportService", () => {
  const actual = jest.requireActual("../../src/services/profileImportService") as Record<string, unknown>;
  return { ...actual, fetchPublicPlaylists: jest.fn() };
});

import { getSessionContext } from "../../src/utils/session";
import { upsertLink } from "../../src/controllers/linksController";
import { fetchPublicPlaylists } from "../../src/services/profileImportService";
import { importController } from "../../src/controllers/importController";
import { quickPlayController } from "../../src/controllers/quickPlayController";

const fetchPlaylists = fetchPublicPlaylists as jest.MockedFunction<typeof fetchPublicPlaylists>;

/** Faux hebergeur : chemin /<hote><chemin> -> reponse. */
const stubRoutes: Record<string, { status: number; location?: string }> = {
  "/link.deezer.com/s/deezerCourt": { status: 302, location: "https://www.deezer.com/fr/playlist/42?utm_source=share" },
  "/spotify.link/spotCourt": { status: 307, location: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=x" },
  "/spotify.link/ailleurs": { status: 302, location: "https://evil.com/" },
  "/link.deezer.com/s/perdu": { status: 302, location: "https://www.deezer.com/deezer-links-404" },
};
const stubCalls: string[] = [];
let server: http.Server;
const savedBase = process.env.SHORT_LINK_TEST_BASE;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    stubCalls.push(req.url ?? "");
    const route = stubRoutes[req.url ?? ""];
    res.writeHead(route?.status ?? 404, route?.location ? { Location: route.location } : {});
    res.end();
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  process.env.SHORT_LINK_TEST_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (savedBase === undefined) delete process.env.SHORT_LINK_TEST_BASE;
  else process.env.SHORT_LINK_TEST_BASE = savedBase;
  server.closeAllConnections();
  await new Promise(r => server.close(r));
});

beforeEach(() => {
  stubCalls.length = 0;
  fetchPlaylists.mockReset();
  (upsertLink as jest.Mock).mockClear();
  (getSessionContext as jest.Mock).mockImplementation(async () => ({ user: { id: "u1" } }));
});

function fakeRes() {
  const res = { statusCode: 200, body: undefined as unknown } as { statusCode: number; body: unknown } & Partial<Response>;
  res.status = ((code: number) => { res.statusCode = code; return res; }) as Response["status"];
  res.json = ((body: unknown) => { res.body = body; return res; }) as Response["json"];
  return res as unknown as Response & { statusCode: number; body: { success: boolean; error?: { code: string; message: string } } };
}

function req(body: unknown): Request {
  return { body, headers: {}, cookies: {} } as unknown as Request;
}

describe("import par lien court", () => {
  it("Deezer : resout une fois, importe la playlist et garde l'adresse longue", async () => {
    fetchPlaylists.mockResolvedValue([{ id: "42", name: "Soiree", trackCount: 12, cover: null }]);
    const res = fakeRes();
    await importController.playlists(req({ url: "https://link.deezer.com/s/deezerCourt" }), res);

    expect(res.statusCode).toBe(200);
    expect(stubCalls).toEqual(["/link.deezer.com/s/deezerCourt"]);
    expect(fetchPlaylists).toHaveBeenCalledWith({ provider: "deezer", type: "playlist", id: "42" });
    expect(upsertLink).toHaveBeenCalledWith(expect.objectContaining({ url: "https://www.deezer.com/fr/playlist/42?utm_source=share", provider: "deezer", kind: "playlist" }));
  });

  it("redirection hors liste : refus net, rien d'importe", async () => {
    const res = fakeRes();
    await importController.playlists(req({ url: "https://spotify.link/ailleurs" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error?.code).toBe("short_link_failed");
    expect(fetchPlaylists).not.toHaveBeenCalled();
    expect(upsertLink).not.toHaveBeenCalled();
  });

  it("lien court qui ne mene pas a une playlist : message clair", async () => {
    const res = fakeRes();
    await importController.playlists(req({ url: "https://link.deezer.com/s/perdu" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error?.message).toMatch(/ne mène pas à une playlist/);
    expect(fetchPlaylists).not.toHaveBeenCalled();
  });

  it("un lien long ne passe pas par le resolveur", async () => {
    fetchPlaylists.mockResolvedValue([{ id: "42", name: "Soiree", trackCount: 12, cover: null }]);
    const res = fakeRes();
    await importController.playlists(req({ url: "https://www.deezer.com/fr/playlist/42" }), res);

    expect(res.statusCode).toBe(200);
    expect(stubCalls).toHaveLength(0);
  });

  it("une adresse locale collee n'est jamais appelee", async () => {
    const res = fakeRes();
    await importController.playlists(req({ url: "https://127.0.0.1:3000/api/health" }), res);

    expect(res.body.error?.code).toBe("unsupported_url");
    expect(stubCalls).toHaveLength(0);
  });
});

describe("partie rapide par lien court", () => {
  it("Spotify : la playlist d'arrivee est celle qu'on lit", async () => {
    fetchPlaylists.mockResolvedValue([]);
    const res = fakeRes();
    await quickPlayController.start(req({ url: "https://spotify.link/spotCourt" }), res);

    expect(stubCalls).toEqual(["/spotify.link/spotCourt"]);
    expect(fetchPlaylists).toHaveBeenCalledWith({ provider: "spotify", type: "playlist", id: "37i9dQZF1DXcBWIGoYBM5M" });
    expect(res.body.error?.code).toBe("no_playlists");
  });
});
