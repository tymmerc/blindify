import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createShortLinkLimiter, SHORT_LINK_MAX_PER_MINUTE } from "../../src/middleware/shortLinkLimiter";

// Une petite appli sur 127.0.0.1 : le limiteur devant une route qui repond 200.
// L'adresse du joueur vient de X-Forwarded-For (trust proxy, comme en prod
// derriere nginx). Aucun appel sortant.
let server: Server;
let base: string;
const savedKey = process.env.E2E_BYPASS_KEY;

beforeAll(async () => {
  process.env.E2E_BYPASS_KEY = "cle-de-test";
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.post("/import", createShortLinkLimiter(), (_req, res) => { res.json({ success: true }); });
  server = app.listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (savedKey === undefined) delete process.env.E2E_BYPASS_KEY;
  else process.env.E2E_BYPASS_KEY = savedKey;
  server.closeAllConnections();
  await new Promise(r => server.close(r));
});

function post(ip: string, url: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, ...headers },
    body: JSON.stringify({ url }),
  });
}

describe("limite des liens courts par adresse IP", () => {
  it(`${SHORT_LINK_MAX_PER_MINUTE} liens courts par minute, puis 429`, async () => {
    for (let i = 0; i < SHORT_LINK_MAX_PER_MINUTE; i += 1) {
      expect((await post("203.0.113.1", `https://spotify.link/${i}`)).status).toBe(200);
    }
    const refused = await post("203.0.113.1", "https://spotify.link/encore");
    expect(refused.status).toBe(429);
    const body = await refused.json() as { success: boolean; error: { code: string } };
    expect(body).toMatchObject({ success: false, error: { code: "rate_limited" } });
  });

  it("les liens longs ne sont pas comptes", async () => {
    for (let i = 0; i < SHORT_LINK_MAX_PER_MINUTE; i += 1) await post("203.0.113.2", `https://spotify.link/${i}`);
    expect((await post("203.0.113.2", "https://www.deezer.com/fr/playlist/42")).status).toBe(200);
    expect((await post("203.0.113.2", "https://spotify.link/encore")).status).toBe(429);
  });

  it("une autre adresse n'est pas touchee", async () => {
    for (let i = 0; i <= SHORT_LINK_MAX_PER_MINUTE; i += 1) await post("203.0.113.3", `https://spotify.link/${i}`);
    expect((await post("203.0.113.4", "https://spotify.link/x")).status).toBe(200);
  });

  it("la cle E2E de la pile passe outre", async () => {
    for (let i = 0; i <= SHORT_LINK_MAX_PER_MINUTE; i += 1) {
      expect((await post("203.0.113.5", `https://spotify.link/${i}`, { "X-E2E-Key": "cle-de-test" })).status).toBe(200);
    }
  });
});
