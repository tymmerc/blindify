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
  metadata?: Record<string, any> | null;
  trackSource: TrackSource;
}

export interface StreamerChatSnapshot {
  total: number;
  correct: number;
  percentCorrect: number;
}

export interface StreamerState {
  roomCode: string;
  hostUserId: number;
  subMode: StreamerSubMode;
  phase: StreamerPhase;
  currentRound: number;
  totalRounds: number;
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
}
