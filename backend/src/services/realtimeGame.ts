export type Verdict = "correct" | "close" | "wrong";

export type RoundTrack = {
  round: number;
  trackId: string;
  audioSourceId?: string | number;
  title: string;
  artist: string;
  previewUrl: string | null;
  albumCover?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PlayerState = {
  userId: number;
  username: string | null;
  avatar?: string | null;
  score: number;
  accuracy: number;
  rounds: number;
  correct: number;
  streak: number;
  bestStreak: number;
  hasAnswered: boolean;
  isReady: boolean;
  lastGuess?: string;
  lastSourceGuess?: number | null;
  lastVerdict?: Verdict;
  answerAt?: number | null;
};

export type GameState = {
  roomCode: string;
  hostUserId: number | null;
  status: "lobby" | "playing" | "reveal" | "finished";
  currentRound: number;
  totalRounds: number;
  currentTrack: RoundTrack | null;
  timing: {
    startAt: number | null;
    revealAt: number | null;
  };
  players: Record<number, PlayerState>;
};

type GameContext = {
  state: GameState;
  tracks: RoundTrack[];
};

const LISTENING_MS = 45_000;

const games = new Map<string, GameContext>();

export function bootstrapGameState(params: {
  roomCode: string;
  hostUserId: number;
  tracks: RoundTrack[];
  participantIds: Array<{ userId: number; username: string | null; avatar?: string | null }>;
}): GameState {
  const initialPlayers: Record<number, PlayerState> = {};
  for (const participant of params.participantIds) {
    initialPlayers[participant.userId] = {
      userId: participant.userId,
      username: participant.username ?? null,
      avatar: participant.avatar ?? null,
      score: 0,
      accuracy: 0,
      rounds: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      hasAnswered: false,
      isReady: false,
    };
  }

  const state: GameState = {
    roomCode: params.roomCode,
    hostUserId: params.hostUserId,
    status: "lobby",
    currentRound: 0,
    totalRounds: params.tracks.length,
    currentTrack: null,
    timing: {
      startAt: null,
      revealAt: null,
    },
    players: initialPlayers,
  };

  games.set(params.roomCode, { state, tracks: params.tracks });
  return state;
}

export function getGameState(roomCode: string): GameState | undefined {
  return games.get(roomCode)?.state;
}

export function clearGame(roomCode: string): void {
  games.delete(roomCode);
}

export function startNextRound(roomCode: string, opts?: { forceRound?: number; startAt?: number }): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  const nextRound = opts?.forceRound ?? ctx.state.currentRound + 1;
  if (nextRound > ctx.state.totalRounds) {
    ctx.state.status = "finished";
    ctx.state.currentTrack = null;
    ctx.state.timing = { startAt: null, revealAt: null };
    return ctx.state;
  }

  const track = ctx.tracks.find(t => t.round === nextRound);
  if (!track) {
    ctx.state.status = "finished";
    ctx.state.currentTrack = null;
    ctx.state.timing = { startAt: null, revealAt: null };
    return ctx.state;
  }

  const startAt = opts?.startAt ?? Date.now();
  const revealAt = startAt + LISTENING_MS;

  ctx.state.status = "playing";
  ctx.state.currentRound = nextRound;
  ctx.state.currentTrack = track;
  ctx.state.timing = { startAt, revealAt };

  Object.values(ctx.state.players).forEach(player => {
    player.hasAnswered = false;
    player.isReady = false;
    player.lastGuess = undefined;
    player.lastSourceGuess = undefined;
    player.lastVerdict = undefined;
    player.answerAt = null;
  });

  return ctx.state;
}

export function recordAnswer(
  roomCode: string,
  userId: number,
  guess: string,
  sourceUserId?: number | null
): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.status !== "playing") return ctx.state;
  const player = ctx.state.players[userId];
  if (!player) return ctx.state;
  player.hasAnswered = true;
  player.lastGuess = guess;
  player.lastSourceGuess = sourceUserId ?? null;
  player.answerAt = Date.now();
  return ctx.state;
}

export function markReady(roomCode: string, userId: number): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  const player = ctx.state.players[userId];
  if (!player) return ctx.state;
  player.isReady = true;

  const everyoneReady =
    ctx.state.status === "reveal" &&
    Object.values(ctx.state.players).every(p => p.isReady);

  if (everyoneReady) {
    const advanced = startNextRound(roomCode);
    return advanced;
  }
  return ctx.state;
}

export function upsertPlayer(
  roomCode: string,
  payload: { userId: number; username: string | null; avatar?: string | null }
): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  if (!ctx.state.players[payload.userId]) {
    ctx.state.players[payload.userId] = {
      userId: payload.userId,
      username: payload.username,
      avatar: (payload as any).avatar ?? null,
      score: 0,
      accuracy: 0,
      rounds: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      hasAnswered: false,
      isReady: false,
    };
  } else {
    ctx.state.players[payload.userId].username = payload.username;
    if (payload.hasOwnProperty("avatar")) {
      ctx.state.players[payload.userId].avatar = (payload as any).avatar ?? null;
    }
  }
  return ctx.state;
}

export function removePlayer(roomCode: string, userId: number): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  delete ctx.state.players[userId];
  const remaining = Object.keys(ctx.state.players).length;
  if (remaining === 0) {
    clearGame(roomCode);
  }
  return ctx.state;
}

export function revealRound(roomCode: string): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.status !== "playing") return ctx.state;
  const track = ctx.state.currentTrack;
  if (!track) return ctx.state;

  const startAt = ctx.state.timing.startAt;

  Object.values(ctx.state.players).forEach(player => {
    const detail = evaluateGuessDetail(player.lastGuess ?? "", track);
    const { next } = computeScore({
      previous: player,
      detail,
      answerAt: player.answerAt,
      startAt: startAt,
      maxDuration: ctx.state.timing.revealAt && startAt ? ctx.state.timing.revealAt - startAt : LISTENING_MS,
      sourceOwnerId: (track.metadata as any)?.owner_user_id ?? null,
      sourceGuess: player.lastSourceGuess ?? null,
    });
    ctx.state.players[player.userId] = {
      ...next,
      hasAnswered: true,
    };
  });

  ctx.state.status = "reveal";
  ctx.state.timing = {
    startAt,
    revealAt: ctx.state.timing.revealAt,
  };
  return ctx.state;
}

export function gameStateSnapshot(roomCode: string): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  return ctx.state;
}

// --- string matching helpers ---
const NORMALIZE_SUBS: Record<string, string> = {
  $: "s",
  "@": "a",
  "\u20ac": "e",
  "&": "and",
};

function normalize(text: string): string {
  const folded = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const replaced = folded.replace(/[@$€&]/g, char => NORMALIZE_SUBS[char] ?? " ");
  return replaced.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const STOP_WORDS = new Set(["feat", "featuring", "feat.", "ft", "ft.", "with", "and", "x", "feat,", "featuring,"]);

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(Boolean)
    .filter(word => !STOP_WORDS.has(word));
}

function evaluateGuessDetail(guess: string, track: RoundTrack): {
  verdict: Verdict;
  matchedTitle: boolean;
  matchedArtist: boolean;
  guessProvided: boolean;
} {
  const normalizedGuess = normalize(guess);
  const guessProvided = normalizedGuess.length > 0;

  // Strict match on normalized full strings, fallback to token containment for title/artist fields
  const titleMatch = guessProvided && normalize(track.title) === normalizedGuess;
  const artistMatch = guessProvided && normalize(track.artist) === normalizedGuess;

  const guessTokens = tokenize(guess);
  const titleTokens = tokenize(track.title);
  const artistTokens = tokenize(track.artist);
  const titleMatchTokens =
    guessTokens.length > 0 && titleTokens.length > 0 && titleTokens.every(tok => guessTokens.includes(tok));
  const artistMatchTokens =
    guessTokens.length > 0 && artistTokens.length > 0 && artistTokens.every(tok => guessTokens.includes(tok));

  const matchedTitle = titleMatch || titleMatchTokens;
  const matchedArtist = artistMatch || artistMatchTokens;

  let verdict: Verdict = "wrong";
  if (matchedTitle && matchedArtist) verdict = "correct";
  else if (matchedTitle || matchedArtist) verdict = "close";

  return { verdict, matchedTitle, matchedArtist, guessProvided };
}

function computeScore(params: {
  previous: PlayerState;
  detail: ReturnType<typeof evaluateGuessDetail>;
  answerAt: number | null | undefined;
  startAt: number | null;
  maxDuration?: number | null;
  sourceOwnerId?: number | null;
  sourceGuess?: number | null;
}): { next: PlayerState; gained: number; verdict: Verdict } {
  const { previous, detail, answerAt, startAt, maxDuration, sourceOwnerId, sourceGuess } = params;
  const verdict = detail.verdict;
  const reactionMs = startAt && answerAt ? Math.max(0, answerAt - startAt) : null;
  const correctTitle = detail.matchedTitle;
  const correctArtist = detail.matchedArtist;
  const correctBoth = correctTitle && correctArtist;

  const titlePoints = correctTitle ? 40 : 0;
  const artistPoints = correctArtist ? 30 : 0;

  let speedPoints = 0;
  const maxMs = maxDuration ?? LISTENING_MS;
  if (reactionMs !== null && detail.guessProvided && (correctTitle || correctArtist)) {
    const timeRatio = 1 - Math.min(Math.max(reactionMs / maxMs, 0), 1);
    speedPoints = Math.round(20 * timeRatio);
  }

  const sourceBonus = sourceOwnerId && sourceGuess && sourceOwnerId === sourceGuess ? 10 : 0;

  const penalty =
    detail.guessProvided && (!correctTitle || !correctArtist) && (correctTitle || correctArtist)
      ? 0
      : detail.guessProvided && (!correctTitle || !correctArtist)
        ? 10
        : 0;

  const rawPoints = titlePoints + artistPoints + speedPoints + sourceBonus - penalty;
  const gainedPoints = Math.max(0, rawPoints);

  const rounds = previous.rounds + 1;
  const correctCount = previous.correct + (correctBoth ? 1 : 0);
  const streak = correctBoth ? previous.streak + 1 : 0;
  const next: PlayerState = {
    ...previous,
    rounds,
    correct: correctCount,
    streak,
    bestStreak: Math.max(previous.bestStreak, streak),
    score: previous.score + gainedPoints,
    accuracy: rounds > 0 ? Math.round((correctCount / rounds) * 100) : 0,
    lastVerdict: verdict,
  };
  return { next, gained: gainedPoints, verdict };
}
