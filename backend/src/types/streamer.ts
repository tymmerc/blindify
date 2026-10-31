export type StreamerPhase =
  | "LOBBY"
  | "STARTING_ROUND"
  | "GUESSING_CHAT"
  | "REVEAL_PARTIAL"
  | "GUESSING_STREAMER"
  | "REVEAL_FINAL"
  | "ROUND_ENDED"
  | "GAME_OVER";

// viewers_only: only the audience guesses; duo: both audience + streamer guess; solo: only streamer guesses (tracks can still come from audience)
export type StreamerSubMode = "viewers_only" | "duo" | "solo";
export type TrackSource = "streamer" | "chat";

export interface StreamerRound {
  round: number;
  trackId: string;
  audioSourceId?: string | number;
  title: string;
  artist: string;
  album?: string | null;
  previewUrl: string | null;
  albumCover?: string | null;
  metadata?: Record<string, unknown> | null;
  trackSource: TrackSource;
  provider?: string | null;
}

export interface StreamerChatSnapshot {
  total: number;
  correct: number;
  percentCorrect: number;
}

/** D'ou vient un viewer du classement : la page blindz.app/live, ou le chat Twitch (T5b). */
export type ViewerSource = "page" | "chat";

/** Une ligne du classement des viewers. `id` est public (pas la cle de reprise). */
export interface StreamerLeaderEntry {
  id: string;
  pseudo: string;
  score: number;
  source: ViewerSource;
}

export interface StreamerState {
  roomCode: string;
  hostUserId: number;
  subMode: StreamerSubMode;
  phase: StreamerPhase;
  currentRound: number;
  totalRounds: number;
  /** Manches demandees par l'hote (plus que totalRounds s'il manquait des titres jouables). */
  requestedRounds?: number;
  /** Pourquoi moins de manches : "library" (playlists trop courtes) ou "lookup" (recherches d'extraits limitees). */
  shortReason?: "library" | "lookup" | null;
  currentTrack: StreamerRound | null;
  timing: {
    startAt: number | null;
    endAt: number | null;
  };
  chatScore: number;
  chatStreak: number;
  streamerScore: number;
  streamerWins: number;
  chatWins: number;
  chatSnapshot?: StreamerChatSnapshot | null;
  /** Viewers inscrits sur la page (et, en T5b, vus dans le chat). */
  viewerCount?: number;
  /** Reponses recues pendant la manche en cours (nombre seulement, jamais le texte). */
  answersCount?: number;
  /** Top 5 des viewers, mis a jour a chaque reveal final. */
  leaderboard?: StreamerLeaderEntry[];
  /** Chaine Twitch dont le chat est lu (T5b), ou null. */
  twitchChannel?: string | null;
}
