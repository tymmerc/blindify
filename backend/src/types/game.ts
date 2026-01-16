export enum GameMode {
  FRIENDS = "friends",
  EVENT = "event",
  STREAMER = "streamer",
}

export enum GamePhase {
  LOBBY = "LOBBY",
  GUESSING = "GUESSING",
  REVEAL = "REVEAL",
  FINISHED = "FINISHED",
}

export type Verdict = "correct" | "close" | "wrong";

export interface RoundTrack {
  round: number;
  trackId: string;
  audioSourceId?: string | number;
  title: string;
  artist: string;
  album?: string | null;
  previewUrl: string | null;
  albumCover?: string | null;
  metadata?: Record<string, any> | null;
}

export interface PlayerState {
  userId: number;
  username: string | null;
  avatar?: string | null;
  score: number;
  hasAnswered: boolean;
  isReady: boolean; // Used for transitioning from REVEAL to next round
  lastGuess?: string;
  lastVerdict?: Verdict;
  answerAt?: number | null;
  streak?: number;
  bestStreak?: number;
}

export interface RoomState {
  roomCode: string;
  hostUserId: number | null;
  mode: GameMode;
  phase: GamePhase;
  currentRound: number;
  totalRounds: number;
  currentTrack: RoundTrack | null;
  players: Record<number, PlayerState>;
  timing: {
    startAt: number | null;
    revealAt: number | null;
  };
  config: {
    autoAdvance: boolean;
    roundDurationMs: number;
  };
}
