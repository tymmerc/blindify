/**
 * Sockets du mode streamer sans session (T5) : l'overlay OBS et les viewers
 * de la page /live. Meme principe que le spectateur de T18 (spectators.ts) :
 * verification au handshake, puis seuls quelques evenements sont ecoutes.
 *
 * - Overlay : handshake.auth.overlay = { salle, jeton }. Jeton signe
 *   (overlayToken.ts). Il rejoint la room « media » : il recoit l'extrait et
 *   le joue dans OBS. Il ne peut rien envoyer d'autre qu'une resynchro.
 * - Viewer : handshake.auth.live = { salle, pseudo, cle? }. Pas de jeton : le
 *   code de la salle est public (affiche sur le stream). Il rejoint la room
 *   « viewers » et la sienne (son resultat). Il peut repondre (une fois par
 *   manche) et se resynchroniser, rien d'autre.
 */
import type { Server, Socket } from "socket.io";
import { pool } from "../config/db";
import { logger } from "../utils/logger";
import { ipRateLimitKey } from "../utils/rateLimitKey";
import { clampText, validRoomCode, MAX_GUESS_LEN } from "../utils/socketValidation";
import { readOverlaySecret, verifyOverlayToken } from "./overlayToken";
import { streamerModeEnabled } from "./streamerConfig";
import { mediaRoom, mediaView, viewerView, viewersRoom } from "./streamerChannels";
import { getStreamerState, recordViewerAnswer, refreshViewerCount, viewerSelfRoom } from "./streamerGame";
import { getViewer, joinViewer, knownKey, ranks, viewerCount, viewerPresence, type ViewerJoinRefusal } from "./streamerViewers";

export type StreamerSocketRefusal =
  | "live_desactive"
  | "live_limite"
  | "live_introuvable"
  | "overlay_desactive"
  | "overlay_refuse"
  | "overlay_expire"
  | ViewerJoinRefusal;

export type StreamerSocketData =
  | { kind: "overlay"; roomCode: string; roomId: number; expiresAt: number }
  | { kind: "live"; roomCode: string; viewerId: string };

type Handshake = { kind: "overlay"; salle: unknown; jeton: unknown } | { kind: "live"; salle: unknown; pseudo: unknown; cle: unknown };
type RoomRow = { id: number; mode: string; status: string };

/** Connexions par IP (ou /64 en IPv6) et par fenetre de 10 minutes. */
export const LIVE_ATTEMPTS = 120;
export const OVERLAY_ATTEMPTS = 20;
const WINDOW_MS = 10 * 60_000;
const attempts = new Map<string, { count: number; start: number }>();

function allowAttempt(kind: Handshake["kind"], ip: string | undefined, now: number): boolean {
  const key = `${kind}:${ipRateLimitKey(ip)}`;
  const limit = kind === "overlay" ? OVERLAY_ATTEMPTS : LIVE_ATTEMPTS;
  const bucket = attempts.get(key);
  if (!bucket || now - bucket.start >= WINDOW_MS) {
    attempts.set(key, { count: 1, start: now });
    return true;
  }
  attempts.set(key, { ...bucket, count: bucket.count + 1 });
  return bucket.count + 1 <= limit;
}

export function resetStreamerAttemptsForTests(): void {
  attempts.clear();
}

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, bucket] of attempts) if (bucket.start < cutoff) attempts.delete(key);
}, WINDOW_MS).unref?.();

export function readStreamerHandshake(socket: Pick<Socket, "handshake">): Handshake | null {
  const auth = socket.handshake.auth as { overlay?: unknown; live?: unknown } | undefined;
  if (auth?.overlay && typeof auth.overlay === "object") {
    const { salle, jeton } = auth.overlay as { salle?: unknown; jeton?: unknown };
    return { kind: "overlay", salle, jeton };
  }
  if (auth?.live && typeof auth.live === "object") {
    const { salle, pseudo, cle } = auth.live as { salle?: unknown; pseudo?: unknown; cle?: unknown };
    return { kind: "live", salle, pseudo, cle };
  }
  return null;
}

async function lookupRoom(roomCode: string): Promise<RoomRow | null> {
  const { rows } = await pool.query<RoomRow>(
    `SELECT id, mode, status FROM multiplayer_rooms WHERE room_code=$1 LIMIT 1`,
    [roomCode],
  );
  return rows[0] ?? null;
}

type Deps = { findRoom?: (code: string) => Promise<RoomRow | null>; overlaySecret?: string | null; now?: number };
type AuthResult = { ok: true; data: StreamerSocketData } | { ok: false; code: StreamerSocketRefusal };

export async function authorizeStreamerSocket(hs: Handshake, ip: string | undefined, deps: Deps = {}): Promise<AuthResult> {
  const now = deps.now ?? Date.now();
  if (!streamerModeEnabled()) return { ok: false, code: "live_desactive" };
  const roomCode = validRoomCode(hs.salle)?.toUpperCase() ?? null;
  // Un viewer qui revient avec sa cle (ecran verrouille, wifi) ne compte pas :
  // seules les nouvelles inscriptions et l'overlay entament la limite par IP.
  const resuming = hs.kind === "live" && roomCode !== null && knownKey(roomCode, hs.cle);
  if (!resuming && !allowAttempt(hs.kind, ip, now)) return { ok: false, code: "live_limite" };
  const room = roomCode ? await (deps.findRoom ?? lookupRoom)(roomCode) : null;
  if (!roomCode || !room || room.mode !== "streamer") {
    return { ok: false, code: hs.kind === "overlay" ? "overlay_refuse" : "live_introuvable" };
  }
  if (hs.kind === "overlay") {
    const secret = deps.overlaySecret === undefined ? readOverlaySecret() : deps.overlaySecret;
    if (!secret) return { ok: false, code: "overlay_desactive" };
    const check = verifyOverlayToken({ roomCode, roomId: room.id, token: hs.jeton, now }, secret);
    if (!check.ok) return { ok: false, code: check.reason === "expired" ? "overlay_expire" : "overlay_refuse" };
    return { ok: true, data: { kind: "overlay", roomCode, roomId: room.id, expiresAt: check.expiresAt } };
  }
  // Une salle finie et videe de la memoire n'accueille plus personne.
  if (room.status === "finished" && !getStreamerState(roomCode)) return { ok: false, code: "live_introuvable" };
  const joined = joinViewer(roomCode, { pseudo: hs.pseudo, key: hs.cle }, now);
  if (!joined.ok) return { ok: false, code: joined.code };
  return { ok: true, data: { kind: "live", roomCode, viewerId: joined.viewer.id } };
}

export function streamerSocketOf(socket: Socket | undefined): StreamerSocketData | null {
  return ((socket?.data as { streamer?: StreamerSocketData } | undefined)?.streamer) ?? null;
}

/** Une resynchro par seconde au plus, par socket. */
function throttled(fn: () => void, minMs = 1_000): () => void {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < minMs) return;
    last = now;
    fn();
  };
}

function sendOverlayInit(socket: Socket, data: Extract<StreamerSocketData, { kind: "overlay" }>): void {
  const state = getStreamerState(data.roomCode);
  socket.emit("overlay:init", {
    roomCode: data.roomCode,
    expiresAt: data.expiresAt,
    viewerCount: viewerCount(data.roomCode),
    state: state ? mediaView(state) : null,
    serverTimestamp: Date.now(),
  });
}

export function attachOverlay(socket: Socket, data: Extract<StreamerSocketData, { kind: "overlay" }>): void {
  socket.join(mediaRoom(data.roomCode));
  logger.info("overlay_connecte", { roomId: data.roomId });
  sendOverlayInit(socket, data);
  const expiry = setTimeout(() => {
    socket.emit("overlay:expired", { roomCode: data.roomCode });
    socket.disconnect(true);
  }, Math.max(0, data.expiresAt - Date.now()));
  expiry.unref?.();
  socket.on("overlay:sync", throttled(() => sendOverlayInit(socket, data)));
  socket.on("disconnect", () => clearTimeout(expiry));
}

function sendLiveInit(socket: Socket, roomCode: string, viewerId: string): void {
  const viewer = getViewer(roomCode, viewerId);
  if (!viewer) {
    socket.emit("live:error", { code: "live_introuvable" });
    socket.disconnect(true);
    return;
  }
  const state = getStreamerState(roomCode);
  const answered = Boolean(state && viewer.answeredRound >= state.currentRound && state.currentRound > 0);
  socket.emit("live:init", {
    roomCode,
    me: { id: viewer.id, key: viewer.key, pseudo: viewer.pseudo, score: viewer.score, rank: ranks(roomCode).get(viewer.id) ?? null },
    answeredRound: answered ? state?.currentRound ?? 0 : 0,
    state: state ? viewerView(state) : null,
    serverTimestamp: Date.now(),
  });
}

/** Reponses d'un viewer : une rafale est coupee (6 envois par 10 s). */
const GUESS_LIMIT = 6;
const GUESS_WINDOW_MS = 10_000;

export function attachViewer(io: Server, socket: Socket, data: Extract<StreamerSocketData, { kind: "live" }>): void {
  const { roomCode, viewerId } = data;
  socket.join(viewersRoom(roomCode));
  socket.join(viewerSelfRoom(roomCode, viewerId));
  viewerPresence(roomCode, viewerId, 1);
  socket.on("disconnect", () => viewerPresence(roomCode, viewerId, -1));
  sendLiveInit(socket, roomCode, viewerId);
  refreshViewerCount(io, roomCode);

  let windowStart = 0;
  let sent = 0;
  socket.on("live:guess", (payload: { title?: unknown; artist?: unknown } | undefined) => {
    const now = Date.now();
    if (now - windowStart >= GUESS_WINDOW_MS) {
      windowStart = now;
      sent = 0;
    }
    sent += 1;
    if (sent > GUESS_LIMIT) {
      socket.emit("live:ack", { roomCode, outcome: "limite" });
      return;
    }
    const title = clampText(payload?.title, MAX_GUESS_LEN);
    const artist = clampText(payload?.artist, MAX_GUESS_LEN);
    const outcome = recordViewerAnswer(io, roomCode, viewerId, { title, artist }, now);
    socket.emit("live:ack", { roomCode, round: getStreamerState(roomCode)?.currentRound ?? 0, outcome });
  });
  socket.on("live:sync", throttled(() => sendLiveInit(socket, roomCode, viewerId)));
}
