/**
 * Viewers d'une partie streamer (T5), en memoire, par salle.
 *
 * Un viewer de la page /live n'a ni compte ni session : un pseudo, et une cle
 * de reprise tiree au sort par le serveur. La page la garde dans le navigateur
 * pour revenir apres une coupure avec son score. La cle ne sort jamais vers
 * les autres : le classement ne montre que `id` (public) et le pseudo.
 *
 * Le registre existe des le lobby (les viewers arrivent avant le lancement)
 * et vit jusqu'au nettoyage de la partie. Les fiches sont remplacees, jamais
 * modifiees en place.
 */
import crypto from "crypto";
import type { StreamerLeaderEntry, ViewerSource } from "../types/streamer";
import { maxStreamerViewers, maxStreamerViewersPerIp } from "./streamerConfig";
import { isBlockedPseudo } from "./pseudoFilter";

export const LEADERBOARD_SIZE = 5;
/** Un viewer parti sans marquer libere sa place apres ce delai (plafond par partie). */
export const STALE_VIEWER_MS = 2 * 60_000;
/** Un registre sans aucune activite depuis ce delai est oublie (salle abandonnee). */
const ROOM_IDLE_MS = 6 * 60 * 60_000;
const PSEUDO_MIN = 2;
const PSEUDO_MAX = 20;
// Lettres de toutes les langues, chiffres, espace et quelques signes courants.
const PSEUDO_FORMAT = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u;
const KEY_FORMAT = /^[A-Za-z0-9_-]{32}$/;

export interface Viewer {
  id: string;
  key: string;
  pseudo: string;
  source: ViewerSource;
  score: number;
  correct: number;
  /** Somme des temps de reponse justes : departage les egalites. */
  reactionMs: number;
  joinedAt: number;
  /** Derniere manche ou il a repondu (0 = jamais). */
  answeredRound: number;
  /** Sockets ouverts de ce viewer, et derniere fois qu'on l'a vu. */
  online: number;
  lastSeen: number;
  /** Cle du pseudo dans la salle (« page:lena », « chat:lena ») : sert a l'exclusion. */
  handle: string;
  /** Adresse d'inscription (ou /64 en IPv6), pour le plafond par adresse. Vide pour le chat. */
  ipKey: string;
}

interface ViewerRoom {
  touchedAt: number;
  viewers: Map<string, Viewer>;
  byKey: Map<string, string>;
  byName: Map<string, string>;
  /** Cles de reprise et pseudos exclus par le streamer : ils ne reviennent pas. */
  banned: Set<string>;
}

export type ViewerJoinRefusal = "pseudo_invalide" | "pseudo_refuse" | "pseudo_pris" | "live_complet" | "ip_pleine" | "exclu";
export type ViewerJoinResult = { ok: true; viewer: Viewer; resumed: boolean } | { ok: false; code: ViewerJoinRefusal };

const rooms = new Map<string, ViewerRoom>();

/** Pseudo nettoye (espaces resserres), ou null s'il ne convient pas. */
export function cleanPseudo(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (value.length < PSEUDO_MIN || value.length > PSEUDO_MAX) return null;
  return PSEUDO_FORMAT.test(value) ? value : null;
}

function nameKey(source: ViewerSource, pseudo: string): string {
  // Un pseudo du chat et un pseudo de la page ne se confondent jamais (T5b).
  return `${source}:${pseudo.toLocaleLowerCase("fr-FR")}`;
}

function roomOf(roomCode: string, now = Date.now()): ViewerRoom {
  const existing = rooms.get(roomCode);
  if (existing) {
    existing.touchedAt = now;
    return existing;
  }
  const created: ViewerRoom = { touchedAt: now, viewers: new Map(), byKey: new Map(), byName: new Map(), banned: new Set() };
  rooms.set(roomCode, created);
  return created;
}

function newViewer(pseudo: string, source: ViewerSource, now: number, handle: string, ipKey = ""): Viewer {
  return {
    id: crypto.randomBytes(6).toString("base64url"),
    key: crypto.randomBytes(24).toString("base64url"),
    pseudo,
    source,
    score: 0,
    correct: 0,
    reactionMs: 0,
    joinedAt: now,
    answeredRound: 0,
    online: 0,
    lastSeen: now,
    handle,
    ipKey,
  };
}

/** La cle de reprise designe-t-elle un viewer connu de la salle ? (sans rien creer) */
export function knownKey(roomCode: string, key: unknown): boolean {
  return typeof key === "string" && KEY_FORMAT.test(key) && Boolean(rooms.get(roomCode)?.byKey.has(key));
}

/** Libere les places des viewers de la page partis depuis longtemps sans un point. */
function releaseStaleViewers(room: ViewerRoom, now: number): void {
  for (const [id, v] of room.viewers) {
    if (v.source !== "page" || v.online > 0 || v.score > 0 || now - v.lastSeen < STALE_VIEWER_MS) continue;
    room.viewers.delete(id);
    room.byKey.delete(v.key);
    room.byName.delete(v.handle);
  }
}

function forget(room: ViewerRoom, v: Viewer): void {
  room.viewers.delete(v.id);
  room.byKey.delete(v.key);
  room.byName.delete(v.handle);
}

/**
 * « Exclure » du streamer : le viewer quitte le classement, sa cle de reprise
 * et son pseudo (ou son login Twitch) ne rentrent plus dans cette salle.
 * Rend la fiche exclue, ou undefined si elle n'existe pas.
 */
export function banViewer(roomCode: string, id: string): Viewer | undefined {
  const room = rooms.get(roomCode);
  const v = room?.viewers.get(id);
  if (!room || !v) return undefined;
  forget(room, v);
  room.banned.add(`key:${v.key}`);
  room.banned.add(v.handle);
  return v;
}

function ipCount(room: ViewerRoom, ipKey: string): number {
  let n = 0;
  for (const v of room.viewers.values()) if (v.source === "page" && v.ipKey === ipKey) n += 1;
  return n;
}

/** Un socket du viewer s'ouvre (+1) ou se ferme (-1). */
export function viewerPresence(roomCode: string, id: string, delta: 1 | -1, now = Date.now()): void {
  const room = rooms.get(roomCode);
  const v = room?.viewers.get(id);
  if (!room || !v) return;
  room.viewers.set(id, { ...v, online: Math.max(0, v.online + delta), lastSeen: now });
}

/**
 * Inscrit un viewer de la page, ou le reprend avec sa cle. Une cle connue
 * l'emporte sur le pseudo envoye (il garde son nom et son score).
 */
export function joinViewer(
  roomCode: string,
  input: { pseudo: unknown; key?: unknown; ipKey?: string },
  now = Date.now(),
): ViewerJoinResult {
  const room = roomOf(roomCode, now);
  if (typeof input.key === "string" && room.banned.has(`key:${input.key}`)) return { ok: false, code: "exclu" };
  if (typeof input.key === "string" && KEY_FORMAT.test(input.key)) {
    const id = room.byKey.get(input.key);
    const known = id ? room.viewers.get(id) : undefined;
    if (known) return { ok: true, viewer: known, resumed: true };
  }
  const pseudo = cleanPseudo(input.pseudo);
  if (!pseudo) return { ok: false, code: "pseudo_invalide" };
  if (isBlockedPseudo(pseudo)) return { ok: false, code: "pseudo_refuse" };
  const handle = nameKey("page", pseudo);
  if (room.banned.has(handle)) return { ok: false, code: "exclu" };
  if (room.byName.has(handle)) return { ok: false, code: "pseudo_pris" };
  const ipKey = input.ipKey ?? "";
  const ipFull = () => ipKey !== "" && ipCount(room, ipKey) >= maxStreamerViewersPerIp();
  const full = () => pageViewerCount(roomCode) >= maxStreamerViewers();
  if (full() || ipFull()) releaseStaleViewers(room, now);
  if (ipFull()) return { ok: false, code: "ip_pleine" };
  if (full()) return { ok: false, code: "live_complet" };
  const viewer = newViewer(pseudo, "page", now, handle, ipKey);
  room.viewers.set(viewer.id, viewer);
  room.byKey.set(viewer.key, viewer.id);
  room.byName.set(handle, viewer.id);
  return { ok: true, viewer, resumed: false };
}

/**
 * Viewer du chat Twitch (T5b), retrouve ou cree par son login Twitch. Pas de
 * cle : il n'a pas de page a rouvrir. Null si le plafond est atteint (le chat
 * a son propre plafond, egal a celui de la page).
 */
export function chatViewer(
  roomCode: string,
  login: string,
  displayName: string,
  now = Date.now(),
): { viewer: Viewer; created: boolean } | null {
  const room = roomOf(roomCode, now);
  const handle = nameKey("chat", login);
  if (room.banned.has(handle)) return null;
  const existingId = room.byName.get(handle);
  const existing = existingId ? room.viewers.get(existingId) : undefined;
  if (existing) return { viewer: existing, created: false };
  if (room.viewers.size - pageViewerCount(roomCode) >= maxStreamerViewers()) return null;
  const viewer = newViewer(displayName, "chat", now, handle);
  room.viewers.set(viewer.id, viewer);
  room.byName.set(handle, viewer.id);
  return { viewer, created: true };
}

export function getViewer(roomCode: string, id: string): Viewer | undefined {
  return rooms.get(roomCode)?.viewers.get(id);
}

export function hasViewerRoom(roomCode: string): boolean {
  return rooms.has(roomCode);
}

export function pageViewerCount(roomCode: string): number {
  let count = 0;
  for (const v of rooms.get(roomCode)?.viewers.values() ?? []) if (v.source === "page") count += 1;
  return count;
}

/** Viewers presents : la page connectee en ce moment, et le chat Twitch (sans socket). */
export function viewerCount(roomCode: string): number {
  let n = 0;
  for (const v of rooms.get(roomCode)?.viewers.values() ?? []) if (v.source === "chat" || v.online > 0) n += 1;
  return n;
}

/** Remplace la fiche d'un viewer par une version mise a jour. */
export function updateViewer(roomCode: string, id: string, patch: (v: Readonly<Viewer>) => Viewer): Viewer | undefined {
  const room = rooms.get(roomCode);
  const current = room?.viewers.get(id);
  if (!room || !current) return undefined;
  room.touchedAt = Date.now();
  const next = { ...patch(current), id: current.id, key: current.key };
  room.viewers.set(id, next);
  return next;
}

function compareViewers(a: Viewer, b: Viewer): number {
  return b.score - a.score || a.reactionMs - b.reactionMs || a.joinedAt - b.joinedAt;
}

/** Tous les viewers ranges, du premier au dernier. */
export function rankedViewers(roomCode: string): Viewer[] {
  return [...(rooms.get(roomCode)?.viewers.values() ?? [])].sort(compareViewers);
}

export function leaderboard(roomCode: string, size = LEADERBOARD_SIZE): StreamerLeaderEntry[] {
  return rankedViewers(roomCode)
    .filter(v => v.score > 0)
    .slice(0, size)
    .map(v => ({ id: v.id, pseudo: v.pseudo, score: v.score, source: v.source }));
}

/** Place de chaque viewer (1 = premier), en un seul tri. */
export function ranks(roomCode: string): Map<string, number> {
  return new Map(rankedViewers(roomCode).map((v, i) => [v.id, i + 1]));
}

/** Nouvelle partie dans la meme salle : chacun repart de 0, les inscrits restent. */
export function resetViewerScores(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const [id, v] of room.viewers) {
    room.viewers.set(id, { ...v, score: 0, correct: 0, reactionMs: 0, answeredRound: 0 });
  }
}

export function clearViewers(roomCode: string): void {
  rooms.delete(roomCode);
}

export function clearAllViewersForTests(): void {
  rooms.clear();
}

/** Registres de salles abandonnees (lobby jamais lance, serveur jamais redemarre). */
export function purgeIdleViewerRooms(now = Date.now()): void {
  for (const [code, room] of rooms) if (now - room.touchedAt > ROOM_IDLE_MS) rooms.delete(code);
}

setInterval(() => purgeIdleViewerRooms(), 30 * 60_000).unref?.();
