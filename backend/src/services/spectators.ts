/**
 * Spectateur d'une partie (T18) : Tym ouvre le lien du mail et regarde la
 * partie comme un joueur qui ne repond pas.
 *
 * - Le socket du spectateur s'authentifie par le jeton du lien
 *   (handshake.auth.spectateur = { salle, jeton }), verifie a chaque
 *   connexion : salle en base, signature, expiration. Pas de session, pas de
 *   compte : il n'est jamais dans room_participants, jamais dans les joueurs
 *   de la partie, jamais dans les stats.
 * - Il rejoint la room socket.io de la salle : il recoit EXACTEMENT les trames
 *   des joueurs, deja caviardees (gameStateSnapshot, redactedGuessingTrack).
 *   Aucune trame ne lui est propre, sauf spectator:init (code, mode, membres
 *   du lobby, expiration) et le compteur de spectateurs.
 * - Aucun gestionnaire de joueur n'est pose sur son socket : il ne peut ni
 *   repondre, ni ecrire dans le chat, ni rien piloter.
 * - Les joueurs voient « 👀 1 spectateur » (room:spectators).
 * - A l'expiration du lien, le socket est coupe.
 */
import type { Server, Socket } from "socket.io";
import ipaddr from "ipaddr.js";
import { pool } from "../config/db";
import { logger } from "../utils/logger";
import { ipRateLimitKey } from "../utils/rateLimitKey";
import { validRoomCode } from "../utils/socketValidation";
import { gameStateSnapshot } from "./realtimeGame";
import * as roomPresence from "./roomPresence";
import { readSpectatorSecret, verifySpectatorToken } from "./spectatorToken";

export const SPECTATORS_EVENT = "room:spectators";
/** Tentatives de connexion spectateur par IP (ou /64 en IPv6) et par fenetre. */
export const SPECTATOR_ATTEMPTS = 20;
export const SPECTATOR_WINDOW_MS = 10 * 60_000;

export type SpectatorData = { roomCode: string; roomId: number; mode: string; discord: boolean; expiresAt: number };
export type SpectatorRefusal = "spectateur_desactive" | "spectateur_limite" | "spectateur_refuse" | "spectateur_expire";
type RoomRow = { id: number; mode: string; discord: boolean };

// ---------------------------------------------------------------------------
// Limite de debit des connexions spectateur
// ---------------------------------------------------------------------------

const attempts = new Map<string, { count: number; start: number }>();

export function allowSpectatorAttempt(ip: string | undefined, now = Date.now()): boolean {
  const key = ipRateLimitKey(ip);
  const bucket = attempts.get(key);
  if (!bucket || now - bucket.start >= SPECTATOR_WINDOW_MS) {
    attempts.set(key, { count: 1, start: now });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= SPECTATOR_ATTEMPTS;
}

export function resetSpectatorAttemptsForTests(): void {
  attempts.clear();
}

setInterval(() => {
  const cutoff = Date.now() - SPECTATOR_WINDOW_MS;
  for (const [key, bucket] of attempts) if (bucket.start < cutoff) attempts.delete(key);
}, SPECTATOR_WINDOW_MS).unref?.();

/**
 * Adresse du client. Le backend n'est joignable que par nginx (port publie sur
 * 127.0.0.1), qui pose X-Real-IP en ecrasant toute valeur du client. Dans le
 * conteneur, la connexion arrive de la passerelle Docker (adresse privee), pas
 * de 127.0.0.1 : on croit X-Real-IP si la connexion vient d'une adresse locale
 * ou privee, jamais sinon.
 */
export function handshakeIp(socket: Pick<Socket, "handshake">): string | undefined {
  const address = socket.handshake.address;
  const real = socket.handshake.headers["x-real-ip"];
  if (typeof real === "string" && real.trim() && isLocalPeer(address)) return real.trim();
  return address;
}

function isLocalPeer(address: string | undefined): boolean {
  if (!address) return false;
  try {
    return ["loopback", "private", "uniqueLocal"].includes(ipaddr.process(address).range());
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Verification du lien
// ---------------------------------------------------------------------------

export function readSpectatorHandshake(socket: Pick<Socket, "handshake">): { salle: unknown; jeton: unknown } | null {
  const raw = (socket.handshake.auth as { spectateur?: unknown } | undefined)?.spectateur;
  if (!raw || typeof raw !== "object") return null;
  const { salle, jeton } = raw as { salle?: unknown; jeton?: unknown };
  return { salle, jeton };
}

async function lookupRoom(roomCode: string): Promise<RoomRow | null> {
  try {
    const { rows } = await pool.query<RoomRow>(
      `SELECT id, mode, discord_instance_id IS NOT NULL AS discord FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
      [roomCode],
    );
    return rows[0] ?? null;
  } catch {
    // Base sans la colonne Discord (migration 006) : salle du site.
    const { rows } = await pool.query<{ id: number; mode: string }>(
      `SELECT id, mode FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
      [roomCode],
    );
    return rows[0] ? { ...rows[0], discord: false } : null;
  }
}

export async function authorizeSpectator(
  { salle, jeton, ip }: { salle: unknown; jeton: unknown; ip: string | undefined },
  deps: { secret?: string | null; findRoom?: (code: string) => Promise<RoomRow | null>; now?: number } = {},
): Promise<{ ok: true; data: SpectatorData } | { ok: false; code: SpectatorRefusal }> {
  const secret = deps.secret === undefined ? readSpectatorSecret() : deps.secret;
  if (!secret) return { ok: false, code: "spectateur_desactive" };
  if (!allowSpectatorAttempt(ip, deps.now)) return { ok: false, code: "spectateur_limite" };
  const roomCode = validRoomCode(salle)?.toUpperCase() ?? null;
  if (!roomCode || typeof jeton !== "string") return { ok: false, code: "spectateur_refuse" };
  const room = await (deps.findRoom ?? lookupRoom)(roomCode);
  if (!room) return { ok: false, code: "spectateur_refuse" };
  const check = verifySpectatorToken({ roomCode, roomId: room.id, token: jeton, now: deps.now }, secret);
  if (!check.ok) return { ok: false, code: check.reason === "expired" ? "spectateur_expire" : "spectateur_refuse" };
  return { ok: true, data: { roomCode, roomId: room.id, mode: room.mode, discord: room.discord, expiresAt: check.expiresAt } };
}

// ---------------------------------------------------------------------------
// Socket du spectateur
// ---------------------------------------------------------------------------

export function spectatorOf(socket: Socket | undefined): SpectatorData | null {
  return ((socket?.data as { spectator?: SpectatorData } | undefined)?.spectator) ?? null;
}

export function spectatorCount(io: Server, roomCode: string): number {
  let count = 0;
  for (const id of io.sockets.adapter.rooms.get(roomCode) ?? []) {
    if (spectatorOf(io.sockets.sockets.get(id))?.roomCode === roomCode) count += 1;
  }
  return count;
}

export function spectatorCountPayload(io: Server, roomCode: string): { roomCode: string; count: number } {
  return { roomCode, count: spectatorCount(io, roomCode) };
}

export function broadcastSpectatorCount(io: Server, roomCode: string): void {
  io.to(roomCode).emit(SPECTATORS_EVENT, spectatorCountPayload(io, roomCode));
}

function sendInit(socket: Socket, data: SpectatorData): void {
  socket.emit("spectator:init", {
    roomCode: data.roomCode,
    mode: data.mode,
    discord: data.discord,
    expiresAt: data.expiresAt,
    members: roomPresence.getMembers(data.roomCode),
    serverTimestamp: Date.now(),
  });
  const snapshot = gameStateSnapshot(data.roomCode);
  if (snapshot) socket.emit("game:state", snapshot);
}

/**
 * Le spectateur est connecte : il rejoint la salle, recoit l'etat courant, et
 * c'est tout. Seul spectator:sync (relire l'etat, limite) est ecoute.
 */
export function attachSpectator(io: Server, socket: Socket, data: SpectatorData): void {
  socket.join(data.roomCode);
  logger.info("spectateur_connecte", { roomId: data.roomId });
  sendInit(socket, data);
  broadcastSpectatorCount(io, data.roomCode);

  const expiry = setTimeout(() => {
    socket.emit("spectator:expired", { roomCode: data.roomCode });
    socket.disconnect(true);
  }, Math.max(0, data.expiresAt - Date.now()));
  expiry.unref?.();

  let lastSync = 0;
  socket.on("spectator:sync", () => {
    const now = Date.now();
    if (now - lastSync < 1_000) return;
    lastSync = now;
    sendInit(socket, data);
  });

  socket.on("disconnect", () => {
    clearTimeout(expiry);
    broadcastSpectatorCount(io, data.roomCode);
  });
}
