export type GameMode = "friends" | "event" | "streamer"

export type GameModeConfig = (typeof GAME_MODES)[GameMode]

export const GAME_MODES = {
  friends: {
    lobby: {
      showRoomCode: true,
      showFriendsList: true,
      allowInvites: true,
      minPlayers: 2,
      autoStart: false,
    },
    game: {
      scoring: true,
      showLeaderboard: "rivals" as const,
      pace: "normal" as const,
      showStreaks: true,
    },
  },

  event: {
    lobby: {
      showRoomCode: false,
      showFriendsList: false,
      allowInvites: false,
      minPlayers: 1,
      autoStart: true,
    },
    game: {
      scoring: true,
      showLeaderboard: "top3" as const,
      pace: "fast" as const,
      largeUI: true,
    },
  },

  streamer: {
    lobby: {
      showRoomCode: true,
      showFriendsList: false,
      allowInvites: false,
      minPlayers: 1,
      autoStart: false,
    },
    game: {
      scoring: true,
      showLeaderboard: "top3" as const,
      pace: "normal" as const,
      showStreaks: true,
    },
  },
} as const

export function resolveGameMode(value: string | null): GameMode | null {
  // Redirect old "chat" mode to "streamer"
  if (value === "chat") return "streamer"
  if (value === "friends" || value === "event" || value === "streamer") return value
  return null
}
