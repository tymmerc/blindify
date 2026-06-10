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
  disconnected?: boolean;
  lastGuess?: string;
  lastGuessTitle?: string | null;
  lastGuessArtist?: string | null;
  lastSourceGuess?: number | null;
  lastVerdict?: Verdict;
  answerAt?: number | null;
};

export type GameState = {
  roomCode: string;
  hostUserId: number | null;
  mode: string;
  phase: "LOBBY" | "GUESSING" | "REVEAL" | "FINISHED";
  currentRound: number;
  totalRounds: number;
  currentTrack: RoundTrack | null;
  timing: {
    startAt: number | null;
    revealAt: number | null;
  };
  players: Record<number, PlayerState>;
  config: { autoAdvance: boolean; roundDurationMs: number };
};

type GameContext = {
  state: GameState;
  tracks: RoundTrack[];
  mode: string;
  roundDurationMs: number;
};

const DEFAULT_LISTENING_MS = 20_000;

const games = new Map<string, GameContext>();

export function bootstrapGameState(params: {
  roomCode: string;
  hostUserId: number;
  tracks: RoundTrack[];
  participants: Array<{ userId: number; username: string | null; avatar?: string | null }>;
  mode?: string;
  config?: { roundDurationMs?: number; autoAdvance?: boolean };
}): GameState {
  const initialPlayers: Record<number, PlayerState> = {};
  for (const participant of params.participants) {
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
    mode: params.mode ?? "friends",
    phase: "LOBBY",
    currentRound: 0,
    totalRounds: params.tracks.length,
    currentTrack: null,
    timing: {
      startAt: null,
      revealAt: null,
    },
    players: initialPlayers,
    config: {
      autoAdvance: params.config?.autoAdvance ?? false,
      roundDurationMs: params.config?.roundDurationMs ?? DEFAULT_LISTENING_MS,
    },
  };

  const roundDurationMs = params.config?.roundDurationMs ?? DEFAULT_LISTENING_MS;
  games.set(params.roomCode, { state, tracks: params.tracks, mode: params.mode ?? "friends", roundDurationMs });
  return state;
}

export function getGameState(roomCode: string): GameState | undefined {
  return games.get(roomCode)?.state;
}

export function getGameMode(roomCode: string): string | undefined {
  return games.get(roomCode)?.mode;
}

export function allAnswerablePlayers(roomCode: string): PlayerState[] {
  const ctx = games.get(roomCode);
  if (!ctx) return [];
  let players = Object.values(ctx.state.players);
  // In event mode, the host is a presenter and doesn't answer
  if (ctx.mode === "event" && ctx.state.hostUserId) {
    players = players.filter(p => p.userId !== ctx.state.hostUserId);
  }
  // Exclude disconnected players so they don't block or prematurely trigger reveals
  return players.filter(p => !p.disconnected);
}

export function markDisconnected(roomCode: string, userId: number): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  const player = ctx.state.players[userId];
  if (!player) return ctx.state;
  player.disconnected = true;
  return ctx.state;
}

export function markReconnected(roomCode: string, userId: number): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  const player = ctx.state.players[userId];
  if (!player) return ctx.state;
  player.disconnected = false;
  return ctx.state;
}

export function clearGame(roomCode: string): void {
  games.delete(roomCode);
}

export function startNextRound(roomCode: string, opts?: { forceRound?: number; startAt?: number }): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  const nextRound = opts?.forceRound ?? ctx.state.currentRound + 1;
  if (nextRound > ctx.state.totalRounds) {
    ctx.state.phase = "FINISHED";
    ctx.state.currentTrack = null;
    ctx.state.timing = { startAt: null, revealAt: null };
    return ctx.state;
  }

  const track = ctx.tracks.find(t => t.round === nextRound);
  if (!track) {
    ctx.state.phase = "FINISHED";
    ctx.state.currentTrack = null;
    ctx.state.timing = { startAt: null, revealAt: null };
    return ctx.state;
  }

  const startAt = opts?.startAt ?? Date.now();
  const revealAt = startAt + ctx.roundDurationMs;

  ctx.state.phase = "GUESSING";
  ctx.state.currentRound = nextRound;
  ctx.state.currentTrack = track;
  ctx.state.timing = { startAt, revealAt };

  Object.values(ctx.state.players).forEach(player => {
    player.hasAnswered = false;
    player.isReady = false;
    // Keep disconnected state - only reconnection should clear it.
    // Resetting it here would make offline players block the reveal timer.
    player.lastGuess = undefined;
    player.lastGuessTitle = null;
    player.lastGuessArtist = null;
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
  sourceUserId?: number | null,
  guessTitle?: string,
  guessArtist?: string,
): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.phase !== "GUESSING") return ctx.state;
  const player = ctx.state.players[userId];
  if (!player) return ctx.state;
  // Prevent double submission — keep first answer
  if (player.hasAnswered) return ctx.state;
  player.hasAnswered = true;
  player.lastGuess = guess;
  player.lastGuessTitle = guessTitle ?? null;
  player.lastGuessArtist = guessArtist ?? null;
  player.lastSourceGuess = sourceUserId ?? null;
  player.answerAt = Date.now();
  return ctx.state;
}

export function markReady(roomCode: string, userId: number): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  // Only accept ready signals during REVEAL phase to prevent "ghost ready" bugs
  // where a premature ready from GUESSING phase causes instant advancement on reveal.
  if (ctx.state.phase !== "REVEAL") return ctx.state;
  const player = ctx.state.players[userId];
  if (!player) return ctx.state;
  player.isReady = true;

  const answerablePlayers = allAnswerablePlayers(roomCode);
  const everyoneReady =
    ctx.state.phase === "REVEAL" &&
    answerablePlayers.length > 0 &&
    answerablePlayers.every(p => p.isReady);

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
  if (ctx.state.phase !== "GUESSING") return ctx.state;
  const track = ctx.state.currentTrack;
  if (!track) return ctx.state;

  const startAt = ctx.state.timing.startAt;

  Object.values(ctx.state.players).forEach(player => {
    const detail = evaluateGuessDetail(
      player.lastGuess ?? "",
      track,
      player.lastGuessTitle,
      player.lastGuessArtist,
    );
    const { next } = computeScore({
      previous: player,
      detail,
      answerAt: player.answerAt,
      startAt: startAt,
      maxDuration: ctx.state.timing.revealAt && startAt ? ctx.state.timing.revealAt - startAt : ctx.roundDurationMs,
      sourceOwnerId: (track.metadata as any)?.owner_user_id ?? null,
      sourceGuess: player.lastSourceGuess ?? null,
    });
    ctx.state.players[player.userId] = {
      ...next,
      hasAnswered: true,
    };
  });

  ctx.state.phase = "REVEAL";
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

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function isWordMatch(word: string, candidates: string[]): boolean {
  if (candidates.includes(word)) return true;
  const tolerance = word.length <= 4 ? 1 : 2;
  return candidates.some(candidate => {
    if (Math.abs(candidate.length - word.length) > tolerance) return false;
    return levenshteinDistance(word, candidate) <= tolerance;
  });
}

function evaluateGuessDetail(
  guess: string,
  track: RoundTrack,
  separateTitle?: string | null,
  separateArtist?: string | null,
): {
  verdict: Verdict;
  matchedTitle: boolean;
  matchedArtist: boolean;
  guessProvided: boolean;
} {
  const hasSeparateFields = (separateTitle && separateTitle.trim().length > 0) || (separateArtist && separateArtist.trim().length > 0);

  if (hasSeparateFields) {
    // Structured matching: check each field independently
    const titleInput = separateTitle?.trim() ?? "";
    const artistInput = separateArtist?.trim() ?? "";
    const guessProvided = titleInput.length > 0 || artistInput.length > 0;

    const titleTokens = tokenize(track.title);
    const artistTokens = tokenize(track.artist);

    let matchedTitle = false;
    if (titleInput.length > 0) {
      const inputTokens = tokenize(titleInput);
      matchedTitle = normalize(track.title) === normalize(titleInput) ||
        (inputTokens.length > 0 && titleTokens.length > 0 && titleTokens.every(tok => isWordMatch(tok, inputTokens)));
    }

    let matchedArtist = false;
    if (artistInput.length > 0) {
      const inputTokens = tokenize(artistInput);
      matchedArtist = normalize(track.artist) === normalize(artistInput) ||
        (inputTokens.length > 0 && artistTokens.length > 0 && artistTokens.every(tok => isWordMatch(tok, inputTokens)));
    }

    let verdict: Verdict = "wrong";
    if (matchedTitle && matchedArtist) verdict = "correct";
    else if (matchedTitle || matchedArtist) verdict = "close";

    return { verdict, matchedTitle, matchedArtist, guessProvided };
  }

  // Legacy: single combined guess string
  const normalizedGuess = normalize(guess);
  const guessProvided = normalizedGuess.length > 0;

  const titleMatch = guessProvided && normalize(track.title) === normalizedGuess;
  const artistMatch = guessProvided && normalize(track.artist) === normalizedGuess;

  const guessTokens = tokenize(guess);
  const titleTokens = tokenize(track.title);
  const artistTokens = tokenize(track.artist);
  const titleMatchTokens =
    guessTokens.length > 0 && titleTokens.length > 0 && titleTokens.every(tok => isWordMatch(tok, guessTokens));
  const artistMatchTokens =
    guessTokens.length > 0 && artistTokens.length > 0 && artistTokens.every(tok => isWordMatch(tok, guessTokens));

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
  const maxMs = maxDuration ?? DEFAULT_LISTENING_MS;
  if (reactionMs !== null && detail.guessProvided && (correctTitle || correctArtist)) {
    const timeRatio = 1 - Math.min(Math.max(reactionMs / maxMs, 0), 1);
    speedPoints = Math.round(30 * timeRatio);
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
