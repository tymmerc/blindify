// Adaptateur Redis de Socket.IO (ADR-001, etape 3).
// - Deux serveurs relies au meme Redis : une emission du serveur B vers une
//   salle arrive au client branche sur le serveur A.
// - Redis coupe apres le branchement : le jeu continue sur ce serveur, sans
//   exception ni attente, puis l'abonnement revient tout seul avec Redis.
// - Sans Redis : adaptateur memoire, comme avant.
// La coupure passe par un relais TCP vers le Redis de test : on coupe le relais,
// pas le conteneur.
import http from "http";
import net from "net";
import type { AddressInfo } from "net";
import Redis from "ioredis";
import { Server } from "socket.io";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import { RedisAdapter } from "@socket.io/redis-adapter";

import { closeRedis, connectPubSub, connectRedis } from "../src/config/redis";
import { attachRedisAdapter } from "../src/socket";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const describeWithRedis = TEST_REDIS_URL ? describe : describe.skip;
const ROOM = "salle-test";

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition jamais remplie");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

function nextEvent<T>(socket: ClientSocket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`pas de ${event} en ${timeoutMs} ms`));
    }, timeoutMs);
    function onEvent(data: T) {
      clearTimeout(timer);
      resolve(data);
    }
    socket.once(event, onEvent);
  });
}

/** Serveur Socket.IO de test : chaque socket rejoint ROOM puis recoit "joined". */
async function startServer(): Promise<{ io: Server; url: string }> {
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  io.on("connection", socket => {
    socket.join(ROOM);
    socket.emit("joined");
  });
  await new Promise<void>(resolve => httpServer.listen(0, "127.0.0.1", resolve));
  return { io, url: `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}` };
}

async function connectToRoom(url: string): Promise<ClientSocket> {
  const client = connectClient(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  await nextEvent(client, "joined");
  return client;
}

/** Relais TCP vers le Redis de test, qu'on peut couper puis rouvrir sur le meme port. */
function redisRelay(target: URL) {
  const open = new Set<net.Socket>();
  const server = net.createServer(inbound => {
    const outbound = net.connect(Number(target.port || 6379), target.hostname);
    for (const s of [inbound, outbound]) {
      open.add(s);
      s.on("error", () => s.destroy());
      s.on("close", () => {
        open.delete(s);
        inbound.destroy();
        outbound.destroy();
      });
    }
    inbound.pipe(outbound).pipe(inbound);
  });
  let port = 0;
  return {
    async listen(): Promise<string> {
      await new Promise<void>(resolve => server.listen(port, "127.0.0.1", resolve));
      port = (server.address() as AddressInfo).port;
      const url = new URL(target.href);
      url.hostname = "127.0.0.1";
      url.port = String(port);
      return url.href;
    },
    async cut(): Promise<void> {
      const closed = new Promise<void>(resolve => server.close(() => resolve()));
      for (const s of open) s.destroy();
      await closed;
    },
  };
}

describeWithRedis("adaptateur Redis de Socket.IO", () => {
  const target = new URL(TEST_REDIS_URL ?? "redis://127.0.0.1:6391");
  let serverA: { io: Server; url: string };
  let serverB: { io: Server; url: string };
  let pubB: Redis;
  let subB: Redis;
  let relay: ReturnType<typeof redisRelay>;
  let client: ClientSocket | undefined;
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  beforeEach(async () => {
    unhandled.length = 0;
    process.on("unhandledRejection", onUnhandled);
    // Serveur A : le chemin de la prod (config/redis.ts), a travers le relais.
    relay = redisRelay(target);
    const relayUrl = await relay.listen();
    await expect(connectRedis(relayUrl)).resolves.toBe(true);
    const pubSub = await connectPubSub();
    expect(pubSub).not.toBeNull();
    serverA = await startServer();
    attachRedisAdapter(serverA.io, pubSub!.pub, pubSub!.sub);
    // Serveur B : ses propres clients, en direct sur le Redis de test.
    pubB = new Redis(target.href);
    subB = pubB.duplicate();
    serverB = await startServer();
    attachRedisAdapter(serverB.io, pubB, subB);
    client = await connectToRoom(serverA.url);
  });

  afterEach(async () => {
    client?.close();
    await serverA.io.close();
    await serverB.io.close();
    await closeRedis();
    pubB.disconnect();
    subB.disconnect();
    await relay.cut();
    process.off("unhandledRejection", onUnhandled);
  });

  it("une emission du serveur B vers la salle arrive au client du serveur A", async () => {
    expect(serverA.io.of("/").adapter).toBeInstanceOf(RedisAdapter);
    await waitFor(() => subB.status === "ready");
    const received = nextEvent<{ from: string }>(client!, "round:start");
    // Laisse le temps aux abonnements de B de s'installer, puis emet.
    await new Promise(resolve => setTimeout(resolve, 100));
    serverB.io.to(ROOM).emit("round:start", { from: "B" });
    await expect(received).resolves.toEqual({ from: "B" });
  });

  it("Redis coupe : l'emission locale arrive vite, sans exception, puis l'abonnement revient", async () => {
    const { pub, sub } = (await connectPubSub())!;
    await relay.cut();
    await waitFor(() => pub.status !== "ready" && sub.status !== "ready");

    const start = Date.now();
    const received = nextEvent<{ round: number }>(client!, "round:start", 500);
    expect(() => serverA.io.to(ROOM).emit("round:start", { round: 2 })).not.toThrow();
    await expect(received).resolves.toEqual({ round: 2 });
    expect(Date.now() - start).toBeLessThan(500);

    // Redis revient : ioredis se reconnecte et se reabonne tout seul.
    await relay.listen();
    await waitFor(() => pub.status === "ready" && sub.status === "ready", 8000);
    let back = false;
    client!.on("round:start", (data: { from?: string }) => {
      if (data.from === "B") back = true;
    });
    await waitFor(() => {
      if (!back) serverB.io.to(ROOM).emit("round:start", { from: "B" });
      return back;
    }, 3000);

    // Laisse passer les rejets eventuels avant de compter.
    await new Promise(resolve => setImmediate(resolve));
    expect(unhandled).toEqual([]);
  }, 15000);

  it("Redis coupe : disconnectSockets coupe quand meme les sockets de ce serveur", async () => {
    const { pub } = (await connectPubSub())!;
    await relay.cut();
    await waitFor(() => pub.status !== "ready");
    const disconnected = nextEvent<string>(client!, "disconnect", 500);
    serverA.io.in(ROOM).disconnectSockets(true);
    await expect(disconnected).resolves.toBeDefined();
    await new Promise(resolve => setImmediate(resolve));
    expect(unhandled).toEqual([]);
  });
});

describe("sans Redis", () => {
  afterEach(async () => {
    await closeRedis();
  });

  it("garde l'adaptateur memoire et les emissions vers la salle", async () => {
    await connectRedis(undefined);
    await expect(connectPubSub()).resolves.toBeNull();
    const server = await startServer();
    try {
      expect(server.io.of("/").adapter).not.toBeInstanceOf(RedisAdapter);
      const client = await connectToRoom(server.url);
      const received = nextEvent<{ round: number }>(client, "round:start");
      server.io.to(ROOM).emit("round:start", { round: 1 });
      await expect(received).resolves.toEqual({ round: 1 });
      client.close();
    } finally {
      await server.io.close();
    }
  });
});
