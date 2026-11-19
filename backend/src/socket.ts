import type { IncomingMessage } from "http";
import { Server as SocketIOServer, type Namespace } from "socket.io";
import { RedisAdapter } from "@socket.io/redis-adapter";
import type Redis from "ioredis";
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

// Commandes que l'adaptateur Redis lance sans attendre ni rattraper l'erreur.
// Redis coupe, elles echouent tout de suite (pas de file d'attente) : chaque
// emission vers une salle deviendrait un unhandledRejection. La coupure est deja
// journalisee une fois par les ecouteurs de config/redis.ts. Le reabonnement
// automatique d'ioredis, au retour de Redis, passe aussi par subscribe.
const FIRE_AND_FORGET = ["publish", "subscribe", "psubscribe", "unsubscribe", "punsubscribe"] as const;

function neverReject(client: Redis): void {
  const methods = client as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const name of FIRE_AND_FORGET) {
    const original = methods[name].bind(client);
    methods[name] = (...args: unknown[]) => original(...args).catch(() => null);
  }
}

type BroadcastOptions = Parameters<RedisAdapter["disconnectSockets"]>[0];

/**
 * Branche l'adaptateur Redis : les emissions vers une salle passent aussi par
 * Redis, vers les autres serveurs. A appeler avant que le serveur accepte des
 * sockets : io.adapter() remplace l'adaptateur des namespaces existants, et les
 * salles de l'ancien sont perdues.
 */
export function attachRedisAdapter(server: SocketIOServer, pub: Redis, sub: Redis): void {
  neverReject(pub);
  neverReject(sub);

  class LocalFirstRedisAdapter extends RedisAdapter {
    constructor(nsp: Namespace) {
      super(nsp, pub, sub);
    }

    // L'adaptateur Redis n'applique ces trois operations a ce serveur qu'a
    // l'echo de sa propre publication : Redis coupe, un disconnectSockets ne
    // coupait plus personne. On applique d'abord en local, puis on publie pour
    // les autres serveurs (l'echo ne trouve plus rien a faire ici).
    override addSockets(opts: BroadcastOptions, rooms: string[]): void {
      super.addSockets(localOnly(opts), rooms);
      if (!opts.flags?.local) super.addSockets(opts, rooms);
    }

    override delSockets(opts: BroadcastOptions, rooms: string[]): void {
      super.delSockets(localOnly(opts), rooms);
      if (!opts.flags?.local) super.delSockets(opts, rooms);
    }

    override disconnectSockets(opts: BroadcastOptions, close: boolean): void {
      super.disconnectSockets(localOnly(opts), close);
      if (!opts.flags?.local) super.disconnectSockets(opts, close);
    }
  }

  server.adapter(LocalFirstRedisAdapter);
}

function localOnly(opts: BroadcastOptions): BroadcastOptions {
  return { ...opts, flags: { ...opts.flags, local: true } };
}
