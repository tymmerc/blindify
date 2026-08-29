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
  ownerChoices?: number[];
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
  lastGained?: number;
  /** Cumul des temps de réponse (ms) — sert UNIQUEMENT au départage d'égalité. */
  totalReactionMs?: number;
};

export type GameState = {
  roomCode: string;
  hostUserId: number | null;
  hostPlays?: boolean;
  /**
   * L'hote est-il toujours connecte ? En mode event il diffuse la musique pour
   * toute la table, et quand il presente seulement il n'apparait PAS dans
   * `players` : sa presence ne peut donc pas se deduire de cette liste.
   */
  hostConnected?: boolean;
  singleContributor?: boolean;
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
  /** Partie mise en pause par l'hote (timers geles cote serveur). */
  paused?: boolean;
  config: { autoAdvance: boolean; roundDurationMs: number };
};

type GameContext = {
  state: GameState;
  tracks: RoundTrack[];
  mode: string;
  roundDurationMs: number;
  sessionId?: number;
};

const DEFAULT_LISTENING_MS = 20_000;

const games = new Map<string, GameContext & { pausedAt?: number | null }>();

export function bootstrapGameState(params: {
  roomCode: string;
  hostUserId: number;
  hostPlays?: boolean;
  singleContributor?: boolean;
  tracks: RoundTrack[];
  participants: Array<{ userId: number; username: string | null; avatar?: string | null }>;
  mode?: string;
  config?: { roundDurationMs?: number; autoAdvance?: boolean };
  sessionId?: number;
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
    hostPlays: params.hostPlays ?? false,
    hostConnected: true,
    singleContributor: params.singleContributor ?? false,
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
  games.set(params.roomCode, { state, tracks: params.tracks, mode: params.mode ?? "friends", roundDurationMs, sessionId: params.sessionId, pausedAt: null });
  return state;
}

export function getGameState(roomCode: string): GameState | undefined {
  return games.get(roomCode)?.state;
}

/** DB session id backing this room's game, if it was started with persistence. */
export function getSessionId(roomCode: string): number | undefined {
  return games.get(roomCode)?.sessionId;
}

export function getGameMode(roomCode: string): string | undefined {
  return games.get(roomCode)?.mode;
}

export function allAnswerablePlayers(roomCode: string): PlayerState[] {
  const ctx = games.get(roomCode);
  if (!ctx) return [];
  let players = Object.values(ctx.state.players);
  // En event, l'hote presente (exclu) SAUF s'il a choisi "je joue aussi".
  if (ctx.mode === "event" && ctx.state.hostUserId && !ctx.state.hostPlays) {
    players = players.filter(p => p.userId !== ctx.state.hostUserId);
  }
  // Exclude disconnected players so they don't block or prematurely trigger reveals
  return players.filter(p => !p.disconnected);
}

export function pauseGame(roomCode: string): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  if (ctx.state.paused) return ctx.state;
  if (ctx.state.phase !== "GUESSING" && ctx.state.phase !== "REVEAL") return ctx.state;
  ctx.pausedAt = Date.now();
  ctx.state.paused = true;
  return ctx.state;
}

export function resumeGame(roomCode: string): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  if (!ctx.state.paused) return ctx.state;
  // Decaler les horloges du temps passe en pause : le chrono reprend ou il en
  // etait, et l'audio se resynchronise tout seul (seek base sur startAt).
  const delta = Date.now() - (ctx.pausedAt ?? Date.now());
  if (ctx.state.timing.startAt) ctx.state.timing.startAt += delta;
  if (ctx.state.timing.revealAt) ctx.state.timing.revealAt += delta;
  ctx.pausedAt = null;
  ctx.state.paused = false;
  return ctx.state;
}

export function setHostConnected(roomCode: string, connected: boolean): GameState | undefined {
  const ctx = games.get(roomCode);
  if (!ctx) return undefined;
  ctx.state.hostConnected = connected;
  return ctx.state;
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

  // Picker "qui a ajoute ?" : on propose 3 candidats (le bon + 2 leurres) plutot
  // que tous les joueurs. Calcule une fois par round, identique pour tout le monde.
  const ownerId = typeof (track.metadata as any)?.owner_user_id === "number"
    ? ((track.metadata as any).owner_user_id as number)
    : null;
  const playerIds = Object.keys(ctx.state.players).map(Number);
  if (ownerId && playerIds.includes(ownerId) && playerIds.length >= 3) {
    const decoys = playerIds.filter(id => id !== ownerId);
    for (let i = decoys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [decoys[i], decoys[j]] = [decoys[j], decoys[i]];
    }
    const choices = [ownerId, decoys[0], decoys[1]];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    track.ownerChoices = choices;
  } else {
    track.ownerChoices = playerIds;
  }

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
    const { next, gained } = computeScore({
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
      lastGained: gained,
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


/**
 * Variantes acceptees d'un TITRE : le titre complet, et le titre "de base"
 * sans les parentheses/crochets ni les suffixes " - Radio Edit" & co.
 * "Chocolat (feat. Awa Imani)" -> taper "chocolat" suffit.
 */
function titleVariants(title: string): string[] {
  const variants = [title];
  const stripped = title
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .split(" - ")[0]
    .trim();
  if (stripped && stripped.toLowerCase() !== title.toLowerCase()) variants.push(stripped);
  return variants;
}

/**
 * Variantes acceptees d'un ARTISTE : la liste complete, et chaque artiste seul.
 * "Naza, Awa Imani" -> "naza" valide, "awa imani" aussi (le feat compte).
 */
function artistVariants(artist: string): string[] {
  const variants = [artist];
  const parts = artist
    .split(/,|;|\/|&|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bavec\b|\bwith\b|\bvs\.?\b|\bx\b|×/i)
    .map(p => p.trim())
    .filter(p => p.length > 1);
  for (const p of parts) {
    if (p.toLowerCase() !== artist.toLowerCase()) variants.push(p);
  }
  return variants;
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
    // Structured matching, CROSS-FIELD : chaque champ est teste contre le titre
    // ET l'artiste. Taper "damso" dans le champ titre doit valider l'artiste -
    // c'est un comportement humain courant (vu en test reel avec des joueurs).
    const titleInput = separateTitle?.trim() ?? "";
    const artistInput = separateArtist?.trim() ?? "";
    const guessProvided = titleInput.length > 0 || artistInput.length > 0;

    const titleVars = titleVariants(track.title);
    const artistVars = artistVariants(track.artist);

    const matchesAnyVariant = (input: string, variants: string[]): boolean => {
      if (!input) return false;
      const inputTokens = tokenize(input);
      return variants.some(variant => {
        const variantTokens = tokenize(variant);
        return (
          normalize(variant) === normalize(input) ||
          (inputTokens.length > 0 && variantTokens.length > 0 && variantTokens.every(tok => isWordMatch(tok, inputTokens)))
        );
      });
    };

    const titleByTitle = matchesAnyVariant(titleInput, titleVars);
    const titleByArtistField = matchesAnyVariant(artistInput, titleVars);
    const artistByArtist = matchesAnyVariant(artistInput, artistVars);
    const artistByTitleField = matchesAnyVariant(titleInput, artistVars);

    // Chaque champ ne credite qu'un seul element (pas de double comptage si
    // l'utilisateur tape la meme chose dans les deux champs).
    const matchedTitle = titleByTitle || (titleByArtistField && !artistByArtist);
    const matchedArtist = artistByArtist || (artistByTitleField && !titleByTitle);

    let verdict: Verdict = "wrong";
    if (matchedTitle && matchedArtist) verdict = "correct";
    else if (matchedTitle || matchedArtist) verdict = "close";

    return { verdict, matchedTitle, matchedArtist, guessProvided };
  }

  // Legacy: single combined guess string
  const normalizedGuess = normalize(guess);
  const guessProvided = normalizedGuess.length > 0;

  const guessTokens = tokenize(guess);
  const anyVariant = (variants: string[]): boolean =>
    variants.some(variant => {
      const variantTokens = tokenize(variant);
      return (
        (guessProvided && normalize(variant) === normalizedGuess) ||
        (guessTokens.length > 0 && variantTokens.length > 0 && variantTokens.every(tok => isWordMatch(tok, guessTokens)))
      );
    });

  const matchedTitle = anyVariant(titleVariants(track.title));
  const matchedArtist = anyVariant(artistVariants(track.artist));

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

  // Scoring lisible : 1 point par bonne réponse (titre, artiste, "qui a ajouté").
  // Pas de bonus vitesse ni de multiplicateur streak — le score se lit direct.
  // La vitesse (totalReactionMs cumulé) sert uniquement de départage d'égalité.
  const titlePoints = correctTitle ? 1 : 0;
  const artistPoints = correctArtist ? 1 : 0;
  const sourceBonus = sourceOwnerId && sourceGuess && sourceOwnerId === sourceGuess ? 1 : 0;

  const gainedPoints = titlePoints + artistPoints + sourceBonus;

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
    // Pas de réponse = temps plein du round (ne pas avantager l'inactif au départage)
    totalReactionMs: (previous.totalReactionMs ?? 0) + (reactionMs ?? maxDuration ?? DEFAULT_LISTENING_MS),
  };
  return { next, gained: gainedPoints, verdict };
}
