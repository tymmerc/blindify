/**
 * Contrat de socket.io sur lequel repose connectIfIdle (frontend/src/lib/socket.ts).
 *
 * Trouve en cherchant le blocage WebKit du lobby : le front rappelait
 * socket.connect() tant que le socket n'etait pas "connected", y compris pendant
 * la poignee de main (sous WebKit comme sous Chromium). Ces tests prennent le
 * VRAI serveur socket.io et le VRAI client (memes versions que la prod), sans
 * base de donnees :
 *  1. un second connect() avant la reponse du serveur fait fermer toute la
 *     connexion (le serveur voit un CONNECT en double, "etat invalide") ;
 *  2. dans ce meme creneau, `active` est deja vrai : le garde de connectIfIdle
 *     (connected || active) suffit a ne pas envoyer ce second CONNECT.
 * Si une mise a jour de socket.io changeait l'un des deux, ces tests le diront.
 */
import http from "http";
import type { AddressInfo } from "net";
import { Server } from "socket.io";
import { io as clientIo, type Socket as ClientSocket } from "socket.io-client";

type Harness = { io: Server; url: string; close: () => Promise<void> };

// Serveur nu ; le middleware asynchrone joue la lecture de la session en base
// (socketHandlers.ts), qui allonge la poignee de main.
async function startServer(authDelayMs: number): Promise<Harness> {
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  io.use((_socket, next) => {
    setTimeout(next, authDelayMs);
  });
  await new Promise<void>(resolve => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;
  return {
    io,
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      io.close();
      await new Promise<void>(resolve => httpServer.close(() => resolve()));
    },
  };
}

// Comme le front : pas d'autoConnect, long-polling d'abord. Sans reconnexion,
// pour voir la fermeture telle quelle.
function newClient(url: string): ClientSocket {
  return clientIo(url, { autoConnect: false, transports: ["polling"], reconnection: false, forceNew: true });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("socket.io : connect() pendant la poignee de main", () => {
  let harness: Harness;
  let clients: ClientSocket[] = [];

  beforeEach(async () => {
    harness = await startServer(30);
  });

  afterEach(async () => {
    clients.forEach(c => c.disconnect());
    clients = [];
    await harness.close();
  });

  function track(c: ClientSocket): string[] {
    clients = [...clients, c];
    const events: string[] = [];
    c.on("connect", () => events.push("connect"));
    c.on("disconnect", reason => events.push(`disconnect:${reason}`));
    return events;
  }

  it("un second connect() avant la reponse du serveur fait fermer la connexion", async () => {
    const c = newClient(harness.url);
    const events = track(c);
    // Le serveur vient d'accepter le premier CONNECT et sa reponse n'est pas
    // encore arrivee au client : c'est le creneau ou l'ancien ensureSocket
    // rappelait connect().
    harness.io.on("connection", () => {
      if (!c.connected) c.connect();
    });
    c.connect();
    await sleep(1000);
    expect(events.some(e => e.startsWith("disconnect:"))).toBe(true);
    expect(c.connected).toBe(false);
  });

  it("le garde de connectIfIdle (connected || active) n'envoie pas de second CONNECT", async () => {
    const c = newClient(harness.url);
    const events = track(c);
    let activeDuringHandshake: boolean | null = null;
    harness.io.on("connection", () => {
      activeDuringHandshake = !c.connected && c.active;
      if (!c.connected && !c.active) c.connect();
    });
    c.connect();
    await sleep(1000);
    expect(activeDuringHandshake).toBe(true);
    expect(events).toEqual(["connect"]);
    expect(c.connected).toBe(true);
  });
});
