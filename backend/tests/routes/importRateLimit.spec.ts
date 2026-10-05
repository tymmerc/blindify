import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";

// Le controleur est remplace : on ne teste ici que la limite posee devant les
// routes d'import. Aucun appel a Deezer ou Spotify, aucune base.
jest.mock("../../src/controllers/importController", () => {
  const repond = (_req: unknown, res: { json: (b: unknown) => void }) => res.json({ success: true, data: {}, error: null });
  return { importController: { playlists: jest.fn(repond), sync: jest.fn(repond), syncAll: jest.fn(repond) } };
});

import importRoutes, { IMPORT_LIMIT_MAX } from "../../src/routes/import";

const CLE_E2E = "cle-de-test-e2e";
let server: Server;
let base: string;

beforeAll(async () => {
  process.env.E2E_BYPASS_KEY = CLE_E2E;
  const app = express();
  app.use(express.json());
  app.use("/api/import", importRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  delete process.env.E2E_BYPASS_KEY;
  await new Promise<void>(resolve => server.close(() => resolve()));
});

function importer(entetes: Record<string, string> = {}) {
  return fetch(`${base}/api/import/sync-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...entetes },
    body: JSON.stringify({ provider: "deezer", playlistIds: ["111"] }),
  });
}

describe("limite des routes d'import (par adresse)", () => {
  it("laisse passer une soiree entiere puis repond 429 avec un message en francais", async () => {
    for (let i = 0; i < IMPORT_LIMIT_MAX; i++) {
      const r = await importer();
      expect(r.status).toBe(200);
    }
    const refus = await importer();
    expect(refus.status).toBe(429);
    const corps = (await refus.json()) as { success: boolean; error: { code: string; message: string } };
    expect(corps.success).toBe(false);
    expect(corps.error.code).toBe("rate_limited");
    expect(corps.error.message).toMatch(/import/i);
  });

  it("la pile de test passe toujours avec la cle E2E, meme limite atteinte", async () => {
    const r = await importer({ "X-E2E-Key": CLE_E2E });
    expect(r.status).toBe(200);
  });

  it("une mauvaise cle E2E ne contourne pas la limite", async () => {
    const r = await importer({ "X-E2E-Key": "devinee" });
    expect(r.status).toBe(429);
  });
});
