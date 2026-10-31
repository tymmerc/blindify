/**
 * Machine a etats du mode streamer (T5), en memoire.
 *
 * LOBBY -> STARTING_ROUND (3 s) -> GUESSING_CHAT (20 s, les viewers repondent)
 *   -> [duo] REVEAL_PARTIAL -> GUESSING_STREAMER (15 s, l'hote repond)
 *   -> REVEAL_FINAL -> ROUND_ENDED -> (l'hote lance la suivante) ... -> GAME_OVER
 * En `solo`, seul l'hote devine : la manche passe directement a GUESSING_STREAMER.
 *
 * Les viewers (page /live, et chat Twitch en T5b) ont une reponse par manche.
 * Leurs points sont calcules et publies au reveal final, pas avant : en duo,
 * le streamer devine encore apres eux.
 *
 * Qui recoit quoi : streamerChannels.ts (l'extrait ne va qu'a l'hote et a
 * l'overlay, la reponse a personne avant le reveal).
 */
import type { Server as IOServer } from "socket.io";
import type { StreamerState, StreamerRound, StreamerSubMode } from "../types/streamer";
import { markMultiplayerRoomFinished, markStreamerSessionFinished } from "./gamePersistence";
import { emitStreamerState, emitToMedia, mediaView, viewerView } from "./streamerChannels";
import { scoreViewerAnswer, type AnswerWindow, type ViewerAnswer } from "./streamerScoring";
import { evaluateGuessDetail } from "./guessMatching";
import {
  clearViewers,
  getViewer,
  leaderboard,
  ranks,
  resetViewerScores,
  updateViewer,
  viewerCount,
} from "./streamerViewers";

export const START_COUNTDOWN_MS = 3_000;
export const CHAT_GUESS_DURATION = 20_000;
export const STREAMER_GUESS_DURATION = 15_000;
/** L'hote coupe (F5, wifi) : la partie l'attend une minute avant de finir. */
export const HOST_ABSENCE_MS = 60_000;
const CLEANUP_MS = 10 * 60_000;
const ANSWERS_THROTTLE_MS = 500;
const ANSWERED_NAMES = 8;

/** Sortie d'une manche pour un viewer, envoyee a lui seul au reveal final. */
export interface ViewerRoundResult {
  viewerId: string;
  round: number;
  verdict: "correct" | "close" | "wrong" | "none";
  points: number;
}

/** Points du chat Twitch (T5b) : facteur applique a une reponse selon son heure. */
export type AnswerFactor = (viewerId: string, answer: ViewerAnswer) => number;

/** Durees d'une manche. Les tests d'integration les raccourcissent. */
export interface StreamerTimings {
  countdownMs: number;
  chatMs: number;
  streamerMs: number;
}

const DEFAULT_TIMINGS: StreamerTimings = {
  countdownMs: START_COUNTDOWN_MS,
  chatMs: CHAT_GUESS_DURATION,
  streamerMs: STREAMER_GUESS_DURATION,
};

interface StreamerCtx {
  state: StreamerState;
  timings: StreamerTimings;
  rounds: StreamerRound[];
  sessionId: number | null;
  timers: { phase?: NodeJS.Timeout; hostAbsence?: NodeJS.Timeout; answers?: NodeJS.Timeout };
  answers: Map<string, ViewerAnswer>;
  answeredNames: string[];
  window: AnswerWindow | null;
  streamerGuess?: { title: string; artist: string };
}

const games = new Map<string, StreamerCtx>();
let answerFactor: AnswerFactor = () => 1;

/** Branche le bareme du chat Twitch (T5b). Par defaut, plein bareme partout. */
export function setAnswerFactor(fn: AnswerFactor): void {
  answerFactor = fn;
}

/** Une personne precise recoit son resultat : la room socket.io de ce viewer. */
export const viewerSelfRoom = (roomCode: string, viewerId: string): string => `stream:viewer:${roomCode}:${viewerId}`;

function setPhase(ctx: StreamerCtx, phase: StreamerState["phase"], update?: Partial<StreamerState>): void {
  ctx.state = { ...ctx.state, ...update, phase };
}

function schedule(ctx: StreamerCtx, delay: number, cb: () => void): void {
  if (ctx.timers.phase) clearTimeout(ctx.timers.phase);
  ctx.timers.phase = setTimeout(cb, delay);
}

function broadcast(io: IOServer, ctx: StreamerCtx, event = "state:sync"): void {
  emitStreamerState(io, ctx.state.roomCode, event, ctx.state);
}

export function bootstrapStreamerGame(params: {
  roomCode: string;
  hostUserId: number;
  rounds: StreamerRound[];
  subMode: StreamerSubMode;
  requestedRounds?: number;
  shortReason?: "library" | "lookup" | null;
  sessionId?: number | null;
  timings?: Partial<StreamerTimings>;
}): StreamerState {
  clearStreamerGame(params.roomCode, { keepViewers: true });
  resetViewerScores(params.roomCode);
  const state: StreamerState = {
    roomCode: params.roomCode,
    hostUserId: params.hostUserId,
    subMode: params.subMode,
    phase: "LOBBY",
    currentRound: 0,
    totalRounds: params.rounds.length,
    requestedRounds: params.requestedRounds ?? params.rounds.length,
    shortReason: params.shortReason ?? null,
    currentTrack: null,
    timing: { startAt: null, endAt: null },
    chatScore: 0,
    chatStreak: 0,
    streamerScore: 0,
    streamerWins: 0,
    chatWins: 0,
    chatSnapshot: null,
    viewerCount: viewerCount(params.roomCode),
    answersCount: 0,
    leaderboard: [],
  };
  games.set(params.roomCode, {
    state,
    rounds: params.rounds,
    timings: { ...DEFAULT_TIMINGS, ...params.timings },
    sessionId: params.sessionId ?? null,
    timers: {},
    answers: new Map(),
    answeredNames: [],
    window: null,
  });
  return state;
}

export function getStreamerState(roomCode: string): StreamerState | undefined {
  return games.get(roomCode)?.state;
}

/** Parties streamer en cours (pas finies) sur le serveur, pour le plafond. */
export function activeStreamerGames(): string[] {
  return [...games.values()].filter(c => c.state.phase !== "GAME_OVER").map(c => c.state.roomCode);
}

export function clearStreamerGame(roomCode: string, opts: { keepViewers?: boolean } = {}): void {
  const ctx = games.get(roomCode);
  if (ctx) for (const t of Object.values(ctx.timers)) if (t) clearTimeout(t);
  games.delete(roomCode);
  if (!opts.keepViewers) clearViewers(roomCode);
}

export function clearAllStreamerGamesForTests(): void {
  for (const code of [...games.keys()]) clearStreamerGame(code);
}

export function publicStreamerState(state: StreamerState): StreamerState {
  return viewerView(state);
}

export function hostStreamerState(state: StreamerState): StreamerState {
  return mediaView(state);
}

/** Le nombre de viewers a change : l'etat et les compteurs le disent. */
export function refreshViewerCount(io: IOServer, roomCode: string): void {
  const count = viewerCount(roomCode);
  const ctx = games.get(roomCode);
  if (ctx) ctx.state = { ...ctx.state, viewerCount: count };
  emitToMedia(io, roomCode, "streamer:viewers", { roomCode, count });
}

export function startNextStreamerRound(io: IOServer, roomCode: string): StreamerState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.phase !== "LOBBY" && ctx.state.phase !== "ROUND_ENDED") return ctx.state;

  const nextRound = ctx.state.currentRound + 1;
  const round = ctx.rounds.find(r => r.round === nextRound);
  if (nextRound > ctx.state.totalRounds || !round) {
    finishGame(io, ctx);
    return ctx.state;
  }

  ctx.answers = new Map();
  ctx.answeredNames = [];
  ctx.window = null;
  ctx.streamerGuess = undefined;
  const startAt = Date.now();
  setPhase(ctx, "STARTING_ROUND", {
    currentRound: nextRound,
    currentTrack: { ...round },
    timing: { startAt, endAt: startAt + ctx.timings.countdownMs },
    chatSnapshot: null,
    answersCount: 0,
  });
  broadcast(io, ctx, "round:start");
  broadcast(io, ctx);
  schedule(ctx, ctx.timings.countdownMs, () => openGuessing(io, ctx));
  return ctx.state;
}

function openGuessing(io: IOServer, ctx: StreamerCtx): void {
  const now = Date.now();
  if (ctx.state.subMode === "solo") {
    setPhase(ctx, "GUESSING_STREAMER", { timing: { startAt: now, endAt: now + ctx.timings.streamerMs } });
    broadcast(io, ctx);
    schedule(ctx, ctx.timings.streamerMs, () => revealFinal(io, ctx));
    return;
  }
  ctx.window = { startAt: now, endAt: now + ctx.timings.chatMs };
  setPhase(ctx, "GUESSING_CHAT", { timing: { ...ctx.window } });
  broadcast(io, ctx);
  schedule(ctx, ctx.timings.chatMs, () => {
    if (ctx.state.subMode === "viewers_only") revealFinal(io, ctx);
    else revealPartial(io, ctx);
  });
}

export type AnswerOutcome = "ok" | "ferme" | "deja" | "inconnu" | "vide";

/** Reponse d'un viewer (page ou chat). Une seule par manche, pendant GUESSING_CHAT. */
export function recordViewerAnswer(
  io: IOServer,
  roomCode: string,
  viewerId: string,
  input: { title?: string; artist?: string },
  at = Date.now(),
): AnswerOutcome {
  const ctx = games.get(roomCode);
  if (!ctx || ctx.state.phase !== "GUESSING_CHAT" || !ctx.window) return "ferme";
  const viewer = getViewer(roomCode, viewerId);
  if (!viewer) return "inconnu";
  const title = input.title?.trim() ?? "";
  const artist = input.artist?.trim() ?? "";
  if (!title && !artist) return "vide";
  if (viewer.answeredRound >= ctx.state.currentRound || ctx.answers.has(viewerId)) return "deja";
  ctx.answers.set(viewerId, { title, artist, at });
  updateViewer(roomCode, viewerId, v => ({ ...v, answeredRound: ctx.state.currentRound }));
  ctx.answeredNames = [viewer.pseudo, ...ctx.answeredNames].slice(0, ANSWERED_NAMES);
  ctx.state = { ...ctx.state, answersCount: ctx.answers.size };
  scheduleAnswersEmit(io, ctx);
  return "ok";
}

/** Compteur de reponses vers l'hote et l'overlay, regroupe (pas une trame par reponse). */
function scheduleAnswersEmit(io: IOServer, ctx: StreamerCtx): void {
  if (ctx.timers.answers) return;
  ctx.timers.answers = setTimeout(() => {
    ctx.timers.answers = undefined;
    emitToMedia(io, ctx.state.roomCode, "streamer:answers", {
      roomCode: ctx.state.roomCode,
      round: ctx.state.currentRound,
      count: ctx.answers.size,
      names: ctx.answeredNames,
    });
  }, ANSWERS_THROTTLE_MS);
}

/** Reponse de l'hote, pendant GUESSING_STREAMER (duo et solo). */
export function recordStreamerGuess(
  io: IOServer,
  roomCode: string,
  userId: number,
  guess: { title?: string; artist?: string },
): void {
  const ctx = games.get(roomCode);
  if (!ctx || ctx.state.phase !== "GUESSING_STREAMER" || userId !== ctx.state.hostUserId) return;
  ctx.streamerGuess = { title: guess.title?.trim() ?? "", artist: guess.artist?.trim() ?? "" };
  revealFinal(io, ctx);
}

/** Note les reponses de la manche et credite les viewers. Rien n'est publie ici. */
function scoreAnswers(ctx: StreamerCtx, track: StreamerRound): ViewerRoundResult[] {
  const window = ctx.window;
  if (!window) return [];
  const roomCode = ctx.state.roomCode;
  const results: ViewerRoundResult[] = [];
  for (const [viewerId, answer] of ctx.answers) {
    const score = scoreViewerAnswer(answer, track, window, answerFactor(viewerId, answer));
    if (score.points > 0) {
      updateViewer(roomCode, viewerId, v => ({
        ...v,
        score: v.score + score.points,
        correct: v.correct + (score.verdict === "correct" ? 1 : 0),
        reactionMs: v.reactionMs + score.reactionMs,
      }));
    }
    results.push({ viewerId, round: track.round, verdict: score.verdict, points: score.points });
  }
  return results;
}

/** Part des viewers qui ont trouve au moins le titre ou l'artiste. */
function chatSnapshotOf(found: boolean[]): NonNullable<StreamerState["chatSnapshot"]> {
  const total = found.length;
  const correct = found.filter(Boolean).length;
  return { total, correct, percentCorrect: total ? Math.round((correct / total) * 100) : 0 };
}

function revealPartial(io: IOServer, ctx: StreamerCtx): void {
  const track = ctx.state.currentTrack;
  if (ctx.state.phase !== "GUESSING_CHAT" || !track) return;
  // Pourcentage seulement : les points individuels sortent au reveal final.
  const found = [...ctx.answers.values()].map(a => {
    const d = evaluateGuessDetail("", track, a.title, a.artist);
    return d.matchedTitle || d.matchedArtist;
  });
  const now = Date.now();
  setPhase(ctx, "REVEAL_PARTIAL", { chatSnapshot: chatSnapshotOf(found), timing: { startAt: now, endAt: null } });
  broadcast(io, ctx, "round:reveal:partial");
  setPhase(ctx, "GUESSING_STREAMER", { timing: { startAt: now, endAt: now + ctx.timings.streamerMs } });
  broadcast(io, ctx);
  schedule(ctx, ctx.timings.streamerMs, () => revealFinal(io, ctx));
}

function revealFinal(io: IOServer, ctx: StreamerCtx): void {
  const phase = ctx.state.phase;
  if (phase !== "GUESSING_CHAT" && phase !== "GUESSING_STREAMER" && phase !== "REVEAL_PARTIAL") return;
  const track = ctx.state.currentTrack;
  if (!track) return;
  const results = scoreAnswers(ctx, track);
  const snapshot = chatSnapshotOf(results.map(r => r.points > 0));
  const guess = ctx.streamerGuess;
  const streamerCorrect = Boolean(guess) && evaluateGuessDetail("", track, guess?.title, guess?.artist).verdict === "correct";
  const wins = ctx.state.subMode === "viewers_only"
    ? {}
    : streamerCorrect
      ? { streamerScore: ctx.state.streamerScore + 1, streamerWins: ctx.state.streamerWins + 1 }
      : { chatWins: ctx.state.chatWins + 1 };
  setPhase(ctx, "REVEAL_FINAL", {
    ...wins,
    chatSnapshot: snapshot,
    chatScore: ctx.state.chatScore + snapshot.correct,
    chatStreak: snapshot.correct > 0 ? ctx.state.chatStreak + 1 : 0,
    leaderboard: leaderboard(ctx.state.roomCode),
    timing: { startAt: Date.now(), endAt: null },
  });
  if (ctx.timers.phase) clearTimeout(ctx.timers.phase);
  broadcast(io, ctx, "round:reveal:final");
  sendResults(io, ctx, results);
  if (ctx.state.currentRound >= ctx.state.totalRounds) {
    finishGame(io, ctx);
    return;
  }
  setPhase(ctx, "ROUND_ENDED", { timing: { startAt: null, endAt: null } });
  broadcast(io, ctx);
}

/** Chaque viewer qui a repondu recoit son verdict, ses points et sa place. */
function sendResults(io: IOServer, ctx: StreamerCtx, results: ViewerRoundResult[]): void {
  if (!results.length) return;
  const roomCode = ctx.state.roomCode;
  const places = ranks(roomCode);
  const total = places.size;
  for (const r of results) {
    const viewer = getViewer(roomCode, r.viewerId);
    if (!viewer || viewer.source !== "page") continue;
    io.to(viewerSelfRoom(roomCode, r.viewerId)).emit("live:result", {
      roomCode,
      round: r.round,
      verdict: r.verdict,
      points: r.points,
      score: viewer.score,
      rank: places.get(r.viewerId) ?? null,
      total,
    });
  }
}

function finishGame(io: IOServer, ctx: StreamerCtx): void {
  if (ctx.state.phase === "GAME_OVER") return;
  const roomCode = ctx.state.roomCode;
  for (const key of ["phase", "answers", "hostAbsence"] as const) {
    const t = ctx.timers[key];
    if (t) clearTimeout(t);
    ctx.timers[key] = undefined;
  }
  setPhase(ctx, "GAME_OVER", { leaderboard: leaderboard(roomCode), timing: { startAt: null, endAt: null } });
  broadcast(io, ctx);
  void markMultiplayerRoomFinished(roomCode);
  void markStreamerSessionFinished(ctx.sessionId, ctx.state.currentRound);
  // Les ecrans de fin (overlay, viewers) gardent l'etat 10 minutes.
  const timer = setTimeout(() => clearStreamerGame(roomCode), CLEANUP_MS);
  timer.unref?.();
  ctx.timers.phase = timer;
}

/** « Finir la partie » de l'hote : podium tout de suite, quelle que soit la phase. */
export function endStreamerGame(io: IOServer, roomCode: string): void {
  const ctx = games.get(roomCode);
  if (ctx) finishGame(io, ctx);
}

/** L'hote a coupe : la partie finit s'il n'est pas revenu dans la minute. */
export function hostLeft(io: IOServer, roomCode: string, delayMs = HOST_ABSENCE_MS): void {
  const ctx = games.get(roomCode);
  if (!ctx || ctx.state.phase === "GAME_OVER" || ctx.timers.hostAbsence) return;
  const timer = setTimeout(() => {
    ctx.timers.hostAbsence = undefined;
    finishGame(io, ctx);
  }, delayMs);
  timer.unref?.();
  ctx.timers.hostAbsence = timer;
}

export function hostBack(roomCode: string): void {
  const ctx = games.get(roomCode);
  if (!ctx?.timers.hostAbsence) return;
  clearTimeout(ctx.timers.hostAbsence);
  ctx.timers.hostAbsence = undefined;
}
