import type { Server as IOServer } from "socket.io";
import type { StreamerState, StreamerRound, StreamerSubMode } from "../types/streamer";
import { markMultiplayerRoomFinished } from "./gamePersistence";

type Guess = { userId: number; guess: string; at: number };

const START_COUNTDOWN_MS = 3_000;
const CHAT_GUESS_DURATION = 20_000;
const STREAMER_GUESS_DURATION = 15_000;

const games = new Map<string, {
  state: StreamerState;
  rounds: StreamerRound[];
  timers: { phase?: NodeJS.Timeout };
  chatGuesses: Map<number, Guess>;
  streamerGuess?: Guess;
}>();

function enforceProviderRule(round: StreamerRound, userId: number): boolean {
  const ownerId = (round.metadata as any)?.owner_user_id;
  return ownerId !== userId;
}

// Phases pendant lesquelles quelqu'un doit encore deviner : la reponse ne
// doit pas partir sur le fil (le streamer devine encore en REVEAL_PARTIAL).
const HIDDEN_PHASES: ReadonlySet<StreamerState["phase"]> = new Set([
  "STARTING_ROUND",
  "GUESSING_CHAT",
  "REVEAL_PARTIAL",
  "GUESSING_STREAMER",
]);

/**
 * Vue publique de l'etat streamer : piste caviardee tant que la manche n'est
 * pas entierement revelee. Meme contrat que le multi classique : un viewer
 * qui lit les trames socket ne doit jamais voir titre/artiste en avance.
 */
function publicState(state: StreamerState): StreamerState {
  if (!state.currentTrack || !HIDDEN_PHASES.has(state.phase)) return state;
  const t = state.currentTrack;
  return {
    ...state,
    currentTrack: {
      round: t.round,
      // trackId/audioSourceId sont l'external_id du provider : les laisser
      // permettait de resoudre la reponse via api.deezer.com/track/{id} avant
      // le reveal. On les masque, comme le multi classique.
      trackId: "hidden",
      title: "",
      artist: "",
      album: null,
      previewUrl: t.previewUrl,
      albumCover: null,
      metadata: null,
      trackSource: t.trackSource,
    },
  };
}

/** Idem publicState mais expose l'export du snapshot pour l'orchestrateur. */
export function publicStreamerState(state: StreamerState): StreamerState {
  return publicState(state);
}

/**
 * Game over streamer : (1) la room sort de 'in_progress' en base tout de suite
 * (sinon zombie + faux game:lost au resync tardif), (2) l'etat memoire est
 * libere apres 10 min (le temps que les clients voient l'ecran de fin).
 */
function scheduleCleanup(roomCode: string): void {
  const ctx = games.get(roomCode);
  if (!ctx) return;
  void markMultiplayerRoomFinished(roomCode);
  if (ctx.timers.phase) clearTimeout(ctx.timers.phase);
  const timer = setTimeout(() => clearStreamerGame(roomCode), 10 * 60_000);
  (timer as NodeJS.Timeout).unref?.();
  ctx.timers.phase = timer;
}

function setPhase(roomCode: string, phase: StreamerState["phase"], update?: Partial<StreamerState>) {
  const ctx = games.get(roomCode);
  if (!ctx) return;
  ctx.state = { ...ctx.state, ...update, phase };
}

function schedule(roomCode: string, delay: number, cb: () => void) {
  const ctx = games.get(roomCode);
  if (!ctx) return;
  if (ctx.timers.phase) clearTimeout(ctx.timers.phase);
  ctx.timers.phase = setTimeout(cb, delay);
}

export function bootstrapStreamerGame(params: {
  roomCode: string;
  hostUserId: number;
  rounds: StreamerRound[];
  subMode: StreamerSubMode;
}): StreamerState {
  const state: StreamerState = {
    roomCode: params.roomCode,
    hostUserId: params.hostUserId,
    subMode: params.subMode,
    phase: "LOBBY",
    currentRound: 0,
    totalRounds: params.rounds.length,
    currentTrack: null,
    timing: { startAt: null, endAt: null },
    chatScore: 0,
    chatStreak: 0,
    streamerScore: 0,
    streamerWins: 0,
    chatWins: 0,
    chatSnapshot: null,
  };
  games.set(params.roomCode, {
    state,
    rounds: params.rounds,
    timers: {},
    chatGuesses: new Map(),
    streamerGuess: undefined,
  });
  return state;
}

export function getStreamerState(roomCode: string): StreamerState | undefined {
  return games.get(roomCode)?.state;
}

export function clearStreamerGame(roomCode: string) {
  const ctx = games.get(roomCode);
  if (ctx?.timers.phase) clearTimeout(ctx.timers.phase);
  games.delete(roomCode);
}

// Un "match" par inclusion doit porter sur assez de matiere : sans garde de
// longueur, taper "a" validait n'importe quel titre contenant un "a".
function looseMatch(guess: string, target: string): boolean {
  if (!guess || !target) return false;
  if (guess === target) return true;
  if (target.length >= 4 && guess.includes(target)) return true;
  if (guess.length >= 4 && guess.length >= target.length * 0.5 && target.includes(guess)) return true;
  return false;
}

function scoreGuess(text: string, round: StreamerRound): boolean {
  const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").trim();
  const guess = norm(text);
  if (!guess) return false;
  const title = norm(round.title);
  const artist = norm(round.artist);
  return looseMatch(guess, title) && looseMatch(guess, artist);
}

export function startNextStreamerRound(io: IOServer, roomCode: string): StreamerState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;

  if (ctx.state.phase !== "LOBBY" && ctx.state.phase !== "ROUND_ENDED") {
    return ctx.state;
  }

  const nextRound = ctx.state.currentRound + 1;
  if (nextRound > ctx.state.totalRounds) {
    setPhase(roomCode, "GAME_OVER");
    io.to(roomCode).emit("state:sync", publicState(ctx.state));
    scheduleCleanup(roomCode);
    return ctx.state;
  }

  const round = ctx.rounds.find(r => r.round === nextRound);
  if (!round) {
    setPhase(roomCode, "GAME_OVER");
    io.to(roomCode).emit("state:sync", publicState(ctx.state));
    scheduleCleanup(roomCode);
    return ctx.state;
  }

  const trackSource = round.trackSource;
  ctx.chatGuesses.clear();
  ctx.streamerGuess = undefined;

  const startAt = Date.now();
  setPhase(roomCode, "STARTING_ROUND", {
    currentRound: nextRound,
    currentTrack: { ...round, trackSource },
    timing: { startAt, endAt: startAt + START_COUNTDOWN_MS },
    chatSnapshot: null,
  });
  io.to(roomCode).emit("round:start", publicState(ctx.state));
  io.to(roomCode).emit("state:sync", publicState(ctx.state));

  schedule(roomCode, START_COUNTDOWN_MS, () => {
    // Solo mode: only the streamer guesses; skip chat phase entirely.
    if (ctx.state.subMode === "solo") {
      setPhase(roomCode, "GUESSING_STREAMER", {
        timing: { startAt: Date.now(), endAt: Date.now() + STREAMER_GUESS_DURATION },
      });
      io.to(roomCode).emit("state:sync", publicState(ctx.state));
      schedule(roomCode, STREAMER_GUESS_DURATION, () => revealFinal(io, roomCode));
      return;
    }

    // Viewers-only or duo: start with chat guesses
    setPhase(roomCode, "GUESSING_CHAT", {
      timing: { startAt: Date.now(), endAt: Date.now() + CHAT_GUESS_DURATION },
    });
    io.to(roomCode).emit("state:sync", publicState(ctx.state));
    schedule(roomCode, CHAT_GUESS_DURATION, () => {
      if (ctx.state.subMode === "viewers_only") {
        revealFinal(io, roomCode);
      } else {
        revealPartial(io, roomCode);
      }
    });
  });

  return ctx.state;
}

export function recordChatGuess(io: IOServer, roomCode: string, userId: number, guess: string) {
  const ctx = games.get(roomCode);
  if (!ctx || ctx.state.phase !== "GUESSING_CHAT" || ctx.state.hostUserId === userId) return;
  if (!ctx.state.currentTrack) return;
  if (!enforceProviderRule(ctx.state.currentTrack, userId)) return;
  if (ctx.chatGuesses.has(userId)) return;
  ctx.chatGuesses.set(userId, { userId, guess, at: Date.now() });
  io.to(roomCode).emit("state:sync", publicState(ctx.state));
}

export function recordStreamerGuess(io: IOServer, roomCode: string, userId: number, guess: string) {
  const ctx = games.get(roomCode);
  if (!ctx || ctx.state.phase !== "GUESSING_STREAMER") return;
  if (userId !== ctx.state.hostUserId) return;
  if (!ctx.state.currentTrack) return;
  if (!enforceProviderRule(ctx.state.currentTrack, userId)) return;
  ctx.streamerGuess = { userId, guess, at: Date.now() };
  revealFinal(io, roomCode);
}

function revealPartial(io: IOServer, roomCode: string) {
  const ctx = games.get(roomCode);
  if (!ctx || ctx.state.phase !== "GUESSING_CHAT") return;
  const current = ctx.state.currentTrack;
  if (!current) return;
  const total = ctx.chatGuesses.size || 1;
  const correct = Array.from(ctx.chatGuesses.values()).filter(g => scoreGuess(g.guess, current)).length;
  const percent = Math.round((correct / total) * 100);
  ctx.state.chatScore += correct;
  ctx.state.chatStreak = correct > 0 ? ctx.state.chatStreak + 1 : 0;
  setPhase(roomCode, "REVEAL_PARTIAL", {
    chatSnapshot: { total, correct, percentCorrect: percent },
    timing: { startAt: Date.now(), endAt: null },
  });
  io.to(roomCode).emit("round:reveal:partial", publicState(ctx.state));
  setPhase(roomCode, "GUESSING_STREAMER", { timing: { startAt: Date.now(), endAt: Date.now() + STREAMER_GUESS_DURATION } });
  io.to(roomCode).emit("state:sync", publicState(ctx.state));
  schedule(roomCode, STREAMER_GUESS_DURATION, () => revealFinal(io, roomCode));
}

function revealFinal(io: IOServer, roomCode: string) {
  const ctx = games.get(roomCode);
  if (!ctx || (ctx.state.phase !== "GUESSING_CHAT" && ctx.state.phase !== "GUESSING_STREAMER" && ctx.state.phase !== "REVEAL_PARTIAL")) return;
  const current = ctx.state.currentTrack;
  if (!current) return;
  const chatCorrect = Array.from(ctx.chatGuesses.values()).filter(g => scoreGuess(g.guess, current)).length;
  const chatTotal = ctx.chatGuesses.size || 1;
  const chatPercent = Math.round((chatCorrect / chatTotal) * 100);
  ctx.state.chatSnapshot = { total: chatTotal, correct: chatCorrect, percentCorrect: chatPercent };
  const streamerCorrect = ctx.streamerGuess ? scoreGuess(ctx.streamerGuess.guess, current) : false;
  if (streamerCorrect) {
    ctx.state.streamerScore += 1;
    ctx.state.streamerWins += 1;
  } else {
    ctx.state.chatWins += 1;
  }
  setPhase(roomCode, "REVEAL_FINAL", {
    timing: { startAt: Date.now(), endAt: null },
  });
  io.to(roomCode).emit("round:reveal:final", publicState(ctx.state));
  const isLastRound = ctx.state.currentRound >= ctx.state.totalRounds;
  if (isLastRound) {
    setPhase(roomCode, "GAME_OVER", { timing: { startAt: null, endAt: null } });
    io.to(roomCode).emit("state:sync", publicState(ctx.state));
    scheduleCleanup(roomCode);
    return;
  }
  setPhase(roomCode, "ROUND_ENDED", { timing: { startAt: null, endAt: null } });
  io.to(roomCode).emit("state:sync", publicState(ctx.state));
}
