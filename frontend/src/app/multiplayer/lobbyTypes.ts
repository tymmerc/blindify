import type React from "react"
import type { GameMode, GameModeConfig } from "@/lib/gameModes"
import type { FriendEntry, MultiplayerParticipant, MultiplayerRoom, RoomInvitation } from "@/lib/types"
import type { LobbyStatus } from "./lobbyMachine"

export type LobbyViewState = "landing" | "hosting" | "waiting" | "playing" | "results"

export type LobbyChatMessage = {
  userId: number
  username: string
  message: string
  timestamp: number
}

export type LobbyRendererProps = {
  mode: GameMode
  modeConfig: GameModeConfig
  view: LobbyViewState
  lobbyStatus: LobbyStatus
  joinCode: string
  setJoinCode: (value: string) => void
  joining: boolean
  onHost: () => void
  onJoinSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  participants: MultiplayerParticipant[]
  scores: Record<number, { username: string | null; score: number; accuracy: number }>
  friends: FriendEntry[]
  friendsLoading: boolean
  friendsError: string | null
  activeFriends: Array<{ userId: number; username: string | null; roomCode: string; state: string; updatedAt: number }>
  onQuickJoin: (code: string) => void
  onInviteFriend: (userId: number) => Promise<void> | void
  onStart: () => void
  starting: boolean
  invites: RoomInvitation[]
  onAcceptInvite: (invitationId: number) => void
  canStart: boolean
  isHost: boolean
  isGuest: boolean
  /** URL de profil musical collee dans le wizard - a consommer (auto-import) en arrivant au lobby */
  initialProfileUrl?: string | null
  importing: boolean
  onImportingChange: (importing: boolean) => void
  currentUserId: number
  room: MultiplayerRoom | null
  hostUser?: { user_id: number; username: string | null } | null
  chatMessages?: LobbyChatMessage[]
  onSendChat?: (message: string) => void
}
