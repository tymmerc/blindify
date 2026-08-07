import { randomUUID } from "crypto";

/**
 * Pierre-feuille-ciseaux de lobby : un mini-jeu d'attente entre joueurs
 * connectes a une meme salle. Etat 100% en memoire (ephemere, non persiste) :
 * les duels vivent le temps du lobby, les victoires sont un simple compteur.
 */

export type RpsMove = "rock" | "paper" | "scissors";

export interface RpsMatch {
  id: string;
  a: number;
  b: number;
  aName: string | null;
  bName: string | null;
  accepted: boolean;
  moves: Record<number, RpsMove>;
  createdAt: number;
}

interface RoomRps {
  matches: Map<string, RpsMatch>;
  wins: Map<number, { username: string | null; wins: number }>;
}

const MATCH_TTL_MS = 2 * 60 * 1000; // un duel oublie est purge apres 2 min

const rooms = new Map<string, RoomRps>();

function getRoom(roomCode: string): RoomRps {
  let room = rooms.get(roomCode);
  if (!room) {
    room = { matches: new Map(), wins: new Map() };
    rooms.set(roomCode, room);
  }
  return room;
}

function prune(room: RoomRps, now: number): void {
  for (const [id, match] of room.matches) {
    if (now - match.createdAt > MATCH_TTL_MS) room.matches.delete(id);
  }
}

export function createMatch(
  roomCode: string,
  a: number,
  aName: string | null,
  b: number,
  bName: string | null,
  now: number
): RpsMatch {
  const room = getRoom(roomCode);
  prune(room, now);
  const match: RpsMatch = { id: randomUUID(), a, b, aName, bName, accepted: false, moves: {}, createdAt: now };
  room.matches.set(match.id, match);
  return match;
}

export function getMatch(roomCode: string, matchId: string): RpsMatch | null {
  return rooms.get(roomCode)?.matches.get(matchId) ?? null;
}

export function acceptMatch(roomCode: string, matchId: string): RpsMatch | null {
  const match = getMatch(roomCode, matchId);
  if (!match) return null;
  match.accepted = true;
  return match;
}

export function removeMatch(roomCode: string, matchId: string): void {
  rooms.get(roomCode)?.matches.delete(matchId);
}

/**
 * Enregistre le coup d'un joueur. Renvoie { done } = true quand les deux ont joue.
 */
export function recordMove(
  roomCode: string,
  matchId: string,
  userId: number,
  move: RpsMove
): { done: boolean; match: RpsMatch } | null {
  const match = getMatch(roomCode, matchId);
  if (!match || !match.accepted) return null;
  if (userId !== match.a && userId !== match.b) return null;
  match.moves[userId] = move;
  const done = match.moves[match.a] != null && match.moves[match.b] != null;
  return { done, match };
}

/** null = egalite. Sinon renvoie l'userId gagnant. */
export function resolveWinner(match: RpsMatch): number | null {
  const ma = match.moves[match.a];
  const mb = match.moves[match.b];
  if (!ma || !mb || ma === mb) return null;
  const beats: Record<RpsMove, RpsMove> = { rock: "scissors", scissors: "paper", paper: "rock" };
  return beats[ma] === mb ? match.a : match.b;
}

export function bumpWin(roomCode: string, userId: number, username: string | null): void {
  const room = getRoom(roomCode);
  const cur = room.wins.get(userId);
  room.wins.set(userId, { username: username ?? cur?.username ?? null, wins: (cur?.wins ?? 0) + 1 });
}

export function getScoreboard(roomCode: string): Array<{ userId: number; username: string | null; wins: number }> {
  const room = rooms.get(roomCode);
  if (!room) return [];
  return Array.from(room.wins.entries())
    .map(([userId, v]) => ({ userId, username: v.username, wins: v.wins }))
    .sort((x, y) => y.wins - x.wins);
}

export function clearRoom(roomCode: string): void {
  rooms.delete(roomCode);
}

export function isValidMove(v: unknown): v is RpsMove {
  return v === "rock" || v === "paper" || v === "scissors";
}
