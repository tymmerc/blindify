import { Server as SocketIOServer } from "socket.io";

export let io: SocketIOServer;

export function initSocket(server: any, allowedOrigins: string[]): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
    // Detection de coupure plus rapide (defauts : 20s/25s, soit jusqu'a 45s
    // avant de voir un joueur absent). En soiree, ces secondes bloquaient les
    // transitions de manche pour toute la table. 15s reste tolerant a un
    // passage de tunnel, sans faire attendre toute la table.
    pingInterval: 10_000,
    pingTimeout: 15_000,
  });
  return io;
}
