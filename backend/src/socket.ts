import type { IncomingMessage } from "http";
import { Server as SocketIOServer } from "socket.io";
import { isSocketOriginAllowed } from "./utils/origins";
import { logger } from "./utils/logger";

export let io: SocketIOServer;

export function initSocket(server: any, allowedOrigins: string[]): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
    // Anti detournement de WebSocket (CSWSH) : l'option cors ne couvre pas
    // l'upgrade WebSocket, et le cookie de session est SameSite=None. Sans ce
    // filtre, une page tierce ouvrait le socket au nom du joueur connecte.
    // engine.io ne l'appelle qu'au handshake (requete sans sid).
    allowRequest: (req: IncomingMessage, cb) => {
      const origin = req.headers.origin;
      const allowed = isSocketOriginAllowed(origin, allowedOrigins);
      if (!allowed) {
        logger.warn("socket_origin_refused", { origin: origin?.slice(0, 200) });
      }
      cb(allowed ? null : "origin_not_allowed", allowed);
    },
    // Detection de coupure plus rapide (defauts : 20s/25s, soit jusqu'a 45s
    // avant de voir un joueur absent). En soiree, ces secondes bloquaient les
    // transitions de manche pour toute la table. 15s reste tolerant a un
    // passage de tunnel, sans faire attendre toute la table.
    pingInterval: 10_000,
    pingTimeout: 15_000,
  });
  return io;
}
