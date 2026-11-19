// Point de sante (/health et /api/health) avec l'etat de Redis (ADR-001).
// Toujours 200 et status "ok" : la sonde de prod et la pile de test de nuit
// attendent ce 200, que Redis soit la ou pas.
import net from "net";
import type { AddressInfo } from "net";
import type { Server } from "http";
import express from "express";

import {
  closeRedis,
  connectRedis,
  getGameState,
  RedisUnavailableError,
  redisKeyPrefix,
  setGameState,
  deleteGameState,
} from "../src/config/redis";
import { healthHandler } from "../src/routes/health";
import { logger } from "../src/utils/logger";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
// Le cas "Redis present" demande un Redis jetable (CI, ou TEST_REDIS_URL en local).
const itWithRedis = TEST_REDIS_URL ? it : it.skip;

/** Un port ou rien n'ecoute : on le prend au systeme puis on le libere. */
async function freePort(): Promise<number> {
  const srv = net.createServer();
  await new Promise<void>(resolve => srv.listen(0, "127.0.0.1", resolve));
  const { port } = srv.address() as AddressInfo;
  await new Promise<void>(resolve => srv.close(() => resolve()));
  return port;
}

describe("point de sante", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.get("/health", healthHandler);
    app.get("/api/health", healthHandler);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  afterEach(async () => {
    await closeRedis();
  });

  async function health(path: string) {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, body: await res.json() };
  }

  itWithRedis("dit redis ok quand Redis repond", async () => {
    await expect(connectRedis(TEST_REDIS_URL)).resolves.toBe(true);
    for (const path of ["/health", "/api/health"]) {
      const { status, body } = await health(path);
      expect(status).toBe(200);
      expect(body.data).toEqual({ status: "ok", redis: "ok" });
    }
  });

  it("dit redis absent, en 200, quand rien n'ecoute a l'adresse", async () => {
    const port = await freePort();
    await expect(connectRedis(`redis://127.0.0.1:${port}`)).resolves.toBe(false);
    for (const path of ["/health", "/api/health"]) {
      const { status, body } = await health(path);
      expect(status).toBe(200);
      expect(body.data).toEqual({ status: "ok", redis: "absent" });
    }
  });

  it("dit redis absent sans REDIS_URL, sans adresse par defaut", async () => {
    await expect(connectRedis(undefined)).resolves.toBe(false);
    const { status, body } = await health("/api/health");
    expect(status).toBe(200);
    expect(body.data).toEqual({ status: "ok", redis: "absent" });
  });
});

describe("acces a Redis : injoignable n'est pas une cle absente", () => {
  afterEach(async () => {
    await closeRedis();
  });

  it("leve RedisUnavailableError quand Redis est injoignable", async () => {
    const port = await freePort();
    await connectRedis(`redis://127.0.0.1:${port}`);
    await expect(getGameState("ABSENT")).rejects.toBeInstanceOf(RedisUnavailableError);
    await expect(setGameState("ABSENT", "{}")).rejects.toBeInstanceOf(RedisUnavailableError);
  });

  it("journalise une seule fois quand Redis reste injoignable", async () => {
    const warn = jest.spyOn(logger, "warn");
    const port = await freePort();
    await connectRedis(`redis://127.0.0.1:${port}`);
    // Laisse passer plusieurs tentatives de reconnexion (200 ms, 400 ms...).
    await new Promise(resolve => setTimeout(resolve, 900));
    const lines = warn.mock.calls.filter(([msg]) => String(msg).startsWith("redis_"));
    expect(lines).toHaveLength(1);
    expect(String(lines[0][0])).toMatch(/^redis_injoignable/);
    warn.mockRestore();
  });

  it("leve RedisUnavailableError quand Redis n'est pas configure", async () => {
    await connectRedis(undefined);
    await expect(getGameState("ABSENT")).rejects.toBeInstanceOf(RedisUnavailableError);
  });

  itWithRedis("renvoie null pour une salle sans copie, et relit une copie ecrite", async () => {
    await connectRedis(TEST_REDIS_URL);
    const code = `TEST-SANTE-${process.pid}`;
    await expect(getGameState(code)).resolves.toBeNull();
    await setGameState(code, JSON.stringify({ phase: "lobby", round: 0 }));
    await expect(getGameState(code)).resolves.toBe(JSON.stringify({ phase: "lobby", round: 0 }));
    await deleteGameState(code);
    await expect(getGameState(code)).resolves.toBeNull();
  });
});

describe("prefixe des cles et des canaux", () => {
  const saved = process.env.REDIS_KEY_PREFIX;
  afterEach(() => {
    if (saved === undefined) delete process.env.REDIS_KEY_PREFIX;
    else process.env.REDIS_KEY_PREFIX = saved;
  });

  it("par defaut, distinct par environnement", () => {
    delete process.env.REDIS_KEY_PREFIX;
    expect(redisKeyPrefix()).toBe("blindz:test:");
  });

  it("REDIS_KEY_PREFIX quand il est sur, le defaut sinon", () => {
    process.env.REDIS_KEY_PREFIX = "blindz:pile-test:";
    expect(redisKeyPrefix()).toBe("blindz:pile-test:");
    // Un joker casserait le MATCH du SCAN et melangerait les instances.
    process.env.REDIS_KEY_PREFIX = "blindz:*:";
    expect(redisKeyPrefix()).toBe("blindz:test:");
  });
});
