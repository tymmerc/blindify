"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Socket } from "socket.io-client"
import { Loader2 } from "lucide-react"
import { getSocket, disconnectSocket } from "@/lib/socket"
import { api } from "@/lib/api"
import { ApiError } from "@/lib/apiClient"
import type { CurrentUserPayload } from "@/lib/api"
import { audioManager } from "@/lib/audioManager"
import type { MultiplayerGameState, MultiplayerParticipant, MultiplayerRoom, SoloTrack, StreamerState, StreamerSubMode } from "@/lib/types"
import { StreamerGameClient } from "@/components/game/StreamerGameClient"
import { MultiplayerGameClient, type ChatMessage } from "@/components/game/MultiplayerGameClient"
import { Button } from "@/components/ui/button"
import { useServerTime } from "@/hooks/useServerTime"
import { useMode } from "@/contexts/ModeContext"
import type { GameMode, GameModeConfig } from "@/lib/gameModes"
import { modeDataAttrs } from "@/lib/uiTokens"
import { getOrCreateGuest } from "@/lib/guest"
import type { FriendEntry, RoomInvitation } from "@/lib/types"
import { LobbyShell } from "./LobbyShell"
import { FriendsLobbyView } from "./FriendsLobbyView"
import { EventLobbyView } from "./EventLobbyView"
import { StreamerLobbyView } from "./StreamerLobbyView"
import { ResultsView } from "./LobbyViews"
import { ENTRY_ROUTE, HEADER_COPY } from "./lobbyCopy"
import type { LobbyRendererProps, LobbyViewState } from "./lobbyTypes"
import { initialLobbyContext, lobbyReducer } from "./lobbyMachine"

type RoomPresenceEvent =
  | {
      type: "joined"
      roomCode: string
      user?: { id?: number; username?: string }
      serverTimestamp: number
    }
  | {
      type: "left" | "disconnected"
      roomCode: string
      userId?: number
      serverTimestamp: number
    }

type ActiveFriend = {
  userId: number
  username: string | null
  roomCode: string
  state: string
  updatedAt: number
}

type PendingAction =
  | { type: "host" }
  | { type: "join"; code: string }
  | { type: "invite"; invitationId: number }

type ModeLobbyViewProps = {
  mode: GameMode
  modeConfig: GameModeConfig
  intent: string | null
  initialJoinCode?: string | null
  autojoin?: string | null
}

function friendlyError(mode: GameMode, phase: "create" | "join" | "start" | "invite"): string {
  const base = {
    friends: {
      create: "Impossible d’ouvrir un duel pour l’instant. Réessaie.",
      join: "Ce code ou cette invitation ne fonctionne pas. Vérifie auprès de ton ami.",
      start: "Le duel ne peut pas démarrer. Vérifie tes titres ou réessaie.",
      invite: "Impossible d’envoyer l’invitation. Reviens plus tard.",
    },
    event: {
      create: "La projection ne peut pas démarrer maintenant. Réessaie dans un instant.",
      join: "Cette projection est verrouillée. Vérifie le dispositif principal.",
      start: "Démarrage impossible. Vérifie ta connexion et relance.",
      invite: "Inviter n’est pas disponible pour ce mode.",
    },
    streamer: {
      create: "Le flux streamer ne peut pas s'ouvrir. Patiente un instant.",
      join: "Rejoindre le flux a échoué. Relance et reste dans le chat.",
      start: "Le flux ne démarre pas. Réessaie.",
      invite: "Inviter n'est pas disponible pour ce mode.",
    },
  } as const
  return base[mode as keyof typeof base][phase]
}

export function ModeLobbyView({ mode, modeConfig, intent, initialJoinCode, autojoin }: ModeLobbyViewProps) {
  const router = useRouter()
  const { accentColor, isGuest, setGuest } = useMode()
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<LobbyViewState>("landing")
  const [lobby, dispatchLobby] = useReducer(lobbyReducer, initialLobbyContext)
  const [flowStarted, setFlowStarted] = useState<boolean>(Boolean(initialJoinCode || autojoin))
  const [requireSpotify, setRequireSpotify] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [hasPendingAuthRestore, setHasPendingAuthRestore] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try {
      return Boolean(
        window.localStorage.getItem("blindify:post_auth_redirect") ||
        window.localStorage.getItem("blindify:pending_event_code")
      )
    } catch {
      return false
    }
  })

  const [room, setRoom] = useState<MultiplayerRoom | null>(null)
  const [participants, setParticipants] = useState<MultiplayerParticipant[]>([])

  const [tracks, setTracks] = useState<SoloTrack[]>([])
  const [gameState, setGameState] = useState<MultiplayerGameState | StreamerState | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [starting, setStarting] = useState(false)
  const [joining, setJoining] = useState(false)
  const [streamerMode, setStreamerMode] = useState<StreamerSubMode>("duo")
  const [soloSource, setSoloSource] = useState<"streamer" | "chat">("streamer")
  const abortFlowRef = useRef(false)

  // Invitations / amis désactivés : on reste sur le code de room uniquement.
  const friends: FriendEntry[] = []
  const friendsLoading = false
  const friendsError: string | null = null
  const activeFriends: ActiveFriend[] = []
  const invites: RoomInvitation[] = []

  const socketRef = useRef<Socket | null>(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const PENDING_EVENT_CODE_KEY = "blindify:pending_event_code"
  const PENDING_AUTH_REDIRECT_KEY = "blindify:post_auth_redirect"
  const handlersRef = useRef<{
    connect?: () => void
    presence?: (payload: RoomPresenceEvent) => void
    playerJoined?: (payload: { userId: number; username?: string | null; roomCode: string }) => void
    gameState?: (payload: MultiplayerGameState | StreamerState) => void
    roundStart?: (payload: { roomCode: string; round: number; track: MultiplayerGameState["currentTrack"]; timing: { startAt: number | null; revealAt: number | null } }) => void
    roundReveal?: (payload: { roomCode: string; round: number; players: MultiplayerGameState["players"]; timing: { startAt: number | null; revealAt: number | null } }) => void
    gameOver?: (payload: { roomCode: string; players: MultiplayerGameState["players"] }) => void
    chat?: (payload: ChatMessage) => void
  }>({})
  const roomRef = useRef<MultiplayerRoom | null>(null)
  const userRef = useRef<CurrentUserPayload | null>(null)
  const currentUserId = userPayload?.user.id ?? 0

  const [joinCode, setJoinCode] = useState(initialJoinCode?.toUpperCase() ?? "")
  const serverNow = useServerTime(socketRef.current)
  const autoHostTriggered = useRef(false)
  const autoStartGameRef = useRef(false)
  const canHostNow = lobby.status === "idle" || lobby.status === "error"
  const isHost = useMemo(() => (room && userPayload ? room.host_user_id === userPayload.user.id : false), [room, userPayload])
  const activeParticipants = useMemo(
    () => {
      const hostId = room?.host_user_id ?? null
      if (mode === "event" || mode === "streamer") {
        return participants.filter(p => p.user_id !== hostId)
      }
      return participants
    },
    [participants, mode, room?.host_user_id]
  )
  const canStartGame =
    isHost &&
    (lobby.status === "hosting" || lobby.status === "waiting") &&
    activeParticipants.length >= modeConfig.lobby.minPlayers &&
    !starting
  const hasSpotify = Boolean(userPayload?.providerConnection?.provider === "spotify")

  useEffect(() => {
    if (initialJoinCode) setJoinCode(initialJoinCode.toUpperCase())
  }, [initialJoinCode])

  useEffect(() => {
    let active = true
    async function bootstrap() {
      try {
        // Check for existing session
        const existing = await api.checkAuth()
        if (!active) return

        if (existing) {
          // Refuse guest sessions for multiplayer: force Spotify login
          if (existing.user.provider === "guest") {
            await api.logout()
            setGuest(false)
            // Redirect to login
            window.location.href = "/blindify/auth/login"
            return
          }
          setGuest(false)
          setUserPayload(existing)
        } else {
          // No session - redirect to login
          window.location.href = "/blindify/auth/login"
          return
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    bootstrap()

    return () => {
      active = false
      const latestRoom = roomRef.current
      const latestUser = userRef.current
      if (latestRoom && latestUser) {
        const socket = socketRef.current
        socket?.emit("room:leave", { roomCode: latestRoom.room_code, userId: latestUser.user.id })
      }
      const socket = socketRef.current
      if (socket && handlersRef.current) {
        if (handlersRef.current.connect) socket.off("connect", handlersRef.current.connect)
        if (handlersRef.current.presence) socket.off("room:presence", handlersRef.current.presence)
        if (handlersRef.current.playerJoined) socket.off("player-joined", handlersRef.current.playerJoined)
        if (handlersRef.current.gameState) socket.off("game:state", handlersRef.current.gameState)
        if (handlersRef.current.roundStart) socket.off("game:round:start", handlersRef.current.roundStart)
        if (handlersRef.current.roundReveal) socket.off("game:round:reveal", handlersRef.current.roundReveal)
        if (handlersRef.current.gameOver) {
          socket.off("game:over", handlersRef.current.gameOver)
          socket.off("game:game:over", handlersRef.current.gameOver)
        }
        if (handlersRef.current.chat) socket.off("room:chat", handlersRef.current.chat)
      }
      disconnectSocket()
    }
  }, [router, isGuest, setGuest])

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => {
    userRef.current = userPayload
    // Don't automatically set guest mode based on provider
    // Guest mode is now explicitly controlled by user choice
  }, [userPayload, setGuest])

  // Fallback: if game is stuck in GUESSING with expired revealAt, request sync
  const lastSyncRef = useRef<number>(0)
  useEffect(() => {
    if (!gameState || !room) return
    const gs = gameState as MultiplayerGameState
    if (gs.phase !== "GUESSING" || !gs.timing?.revealAt) return
    const overdue = serverNow - gs.timing.revealAt
    if (overdue < 3000) return // wait 3s past expiry before syncing
    if (Date.now() - lastSyncRef.current < 5000) return // max once per 5s
    const socket = socketRef.current
    if (!socket?.connected) return
    lastSyncRef.current = Date.now()
    socket.emit("game:sync", { roomCode: room.room_code })
  }, [gameState, room, serverNow])

  // Safety net: if game is stuck in REVEAL for too long, re-emit game:ready
  const revealStuckRef = useRef<number | null>(null)
  useEffect(() => {
    if (!gameState || !room) {
      revealStuckRef.current = null
      return
    }
    const gs = gameState as MultiplayerGameState
    if (gs.phase !== "REVEAL") {
      revealStuckRef.current = null
      return
    }
    // Record when we first noticed REVEAL phase
    if (revealStuckRef.current === null) {
      revealStuckRef.current = Date.now()
    }
    const stuckMs = Date.now() - revealStuckRef.current
    if (stuckMs < 15000) return // wait 15s before considering it stuck
    if (Date.now() - lastSyncRef.current < 5000) return // max once per 5s
    const socket = socketRef.current
    if (!socket?.connected) return
    lastSyncRef.current = Date.now()
    // Re-emit ready to unstick the game
    socket.emit("game:ready", { roomCode: room.room_code })
  }, [gameState, room, serverNow])

  // Safety net: ensure socket joins the room whenever we have a room and socket is connected
  // Track the last socket ID + room combo to re-emit on reconnect
  const lastJoinKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!room?.room_code || !userPayload?.user) return
    const socket = socketRef.current
    if (!socket?.connected || !socket.id) return

    // Re-emit room:join whenever socket ID or room changes (handles reconnections)
    const joinKey = `${socket.id}:${room.room_code}`
    if (lastJoinKeyRef.current === joinKey) return
    lastJoinKeyRef.current = joinKey

    socket.emit("room:join", {
      roomCode: room.room_code,
      user: { id: userPayload.user.id, username: userPayload.user.username ?? undefined },
    })
  }, [room?.room_code, userPayload?.user, socketConnected])

  const ensureSocket = useCallback((): Socket => {
    if (!socketRef.current) {
      socketRef.current = getSocket()
      // Track connection status
      socketRef.current.on("connect", () => {
        setSocketConnected(true)
      })
      socketRef.current.on("disconnect", () => {
        setSocketConnected(false)
        // Reset join key to force re-join on reconnect
        lastJoinKeyRef.current = null
      })
      // Check if already connected
      if (socketRef.current.connected) {
        setSocketConnected(true)
      }
    }
    return socketRef.current
  }, [])

  // Initialize socket early when user is available
  useEffect(() => {
    if (!userPayload?.user) return
    ensureSocket()
  }, [userPayload?.user, ensureSocket])

  const syncParticipants = useCallback((list: MultiplayerParticipant[]) => {
    setParticipants(list)
  }, [])

  const refreshParticipants = useCallback(
    async (roomCode: string) => {
      try {
        const details = await api.roomDetails(roomCode)
        setRoom(details.room)
        syncParticipants(details.participants)
      } catch {
        // ignore transient errors
      }
    },
    [syncParticipants]
  )

  useEffect(() => {
    if (!room?.room_code) return
    if (view !== "hosting" && view !== "waiting") return
    const interval = setInterval(() => refreshParticipants(room.room_code), 3500)
    return () => clearInterval(interval)
  }, [room?.room_code, view, refreshParticipants])

  const storePostAuthRedirect = useCallback(
    (action?: PendingAction | null) => {
      if (typeof window === "undefined") return
      const params = new URLSearchParams()
      params.set("mode", mode)
      const effectiveAction = action ?? pendingAction ?? null
      if (effectiveAction?.type === "host") {
        params.set("intent", "host")
      } else {
        const targetCode = effectiveAction?.type === "join" ? effectiveAction.code : joinCode
        if (targetCode) params.set("code", targetCode.toUpperCase())
      }
      const target = `/multiplayer?${params.toString()}`
      try {
        window.localStorage.setItem(PENDING_AUTH_REDIRECT_KEY, target)
      } catch {
        // ignore storage failures
      }
    },
    [mode, pendingAction, joinCode]
  )

  const ensureSpotify = useCallback(
    async (_next: PendingAction): Promise<boolean> => {
      // Host display-only: no enforced Spotify; server will gate start if no connected players.
      return true
    },
    []
  )

  const requireSession = useCallback(
    (action?: PendingAction): boolean => {
      if (loading) return false
      if (userPayload) return true
      if (action) setPendingAction(action)
      storePostAuthRedirect(action ?? null)
      router.replace("/auth/login")
      return false
    },
    [loading, router, storePostAuthRedirect, userPayload]
  )

  const resolveViewFromState = useCallback(
    (state: MultiplayerGameState | StreamerState): LobbyViewState => {
      const isStreamer = mode === "streamer"
      const basePhase = state.phase
      const isFinished = isStreamer ? basePhase === "GAME_OVER" : basePhase === "FINISHED"
      const isPlaying = isStreamer
        ? ["LOBBY", "STARTING_ROUND", "GUESSING_CHAT", "GUESSING_STREAMER", "REVEAL_PARTIAL", "REVEAL_FINAL", "ROUND_ENDED"].includes(basePhase as any)
        : basePhase === "GUESSING" ||
          basePhase === "REVEAL" ||
          (basePhase === "LOBBY" && (state as MultiplayerGameState).currentRound > 0)
      return isFinished ? "results" : isPlaying ? "playing" : "waiting"
    },
    [mode]
  )

  type LobbyActionType = "reset" | "hosting" | "waiting" | "playing" | "results"

  const viewToLobbyAction = useCallback((state: LobbyViewState): LobbyActionType => {
    switch (state) {
      case "landing":
        return "reset"
      case "hosting":
        return "hosting"
      case "waiting":
        return "waiting"
      case "playing":
        return "playing"
      case "results":
        return "results"
      default:
        return "reset"
    }
  }, [])

  const attachSocketListeners = useCallback(
    (roomCode: string) => {
      const socket = ensureSocket()

      if (handlersRef.current.connect) socket.off("connect", handlersRef.current.connect)
      if (handlersRef.current.presence) socket.off("room:presence", handlersRef.current.presence)
      if (handlersRef.current.playerJoined) socket.off("player-joined", handlersRef.current.playerJoined)
      if (handlersRef.current.gameState) socket.off("game:state", handlersRef.current.gameState)
      if (handlersRef.current.roundStart) socket.off("game:round:start", handlersRef.current.roundStart)
      if (handlersRef.current.roundReveal) socket.off("game:round:reveal", handlersRef.current.roundReveal)
      if (handlersRef.current.gameOver) {
        socket.off("game:over", handlersRef.current.gameOver)
        socket.off("game:game:over", handlersRef.current.gameOver)
      }
      if (handlersRef.current.chat) socket.off("room:chat", handlersRef.current.chat)

      const presenceHandler = (payload: RoomPresenceEvent) => {
        if (payload.roomCode !== roomCode) return
        if (payload.type === "joined") {
          const userId = payload.user?.id
          if (!userId) return
          setParticipants(prev => {
            if (prev.find(p => p.user_id === userId)) return prev
            return [...prev, { user_id: userId, username: payload.user?.username ?? null }]
          })
          refreshParticipants(roomCode)
        } else if ((payload.type === "left" || payload.type === "disconnected") && payload.userId) {
          setParticipants(prev => prev.filter(p => p.user_id !== payload.userId))
        }
      }

      const playerJoinedHandler = (payload: { userId: number; username?: string | null; roomCode: string }) => {
        if (payload.roomCode !== roomCode) return
        setParticipants(prev => {
          if (prev.find(p => p.user_id === payload.userId)) return prev
          return [...prev, { user_id: payload.userId, username: payload.username ?? null }]
        })
        ;(async () => {
          try {
            const updated = await api.roomDetails(payload.roomCode)
            setParticipants(updated.participants)
          } catch (err) {
            console.error("sync_participants_after_join_failed", err)
          }
        })()
      }

      const gameStateHandler = (payload: MultiplayerGameState | StreamerState) => {
        if (payload.roomCode !== roomCode) return
        setGameState(prev => {
          // Prevent a stale GUESSING broadcast from overwriting a REVEAL state
          // within the same round (race condition when both players answer near-simultaneously)
          if (prev && "phase" in prev && "phase" in payload) {
            const prevMulti = prev as MultiplayerGameState
            const newMulti = payload as MultiplayerGameState
            if (
              prevMulti.phase === "REVEAL" &&
              newMulti.phase === "GUESSING" &&
              newMulti.currentRound === prevMulti.currentRound
            ) {
              return prev
            }
          }
          return payload
        })
        const nextView = resolveViewFromState(payload)
        setView(nextView)
        dispatchLobby({ type: viewToLobbyAction(nextView) })
      }

      const roundStartHandler = (payload: {
        roomCode: string
        round: number
        track: MultiplayerGameState["currentTrack"]
        timing: { startAt: number | null; revealAt: number | null }
      }) => {
        if (payload.roomCode !== roomCode) return
        if (mode === "streamer") return
        setGameState(prev => {
          if (!prev) {
            // Build a minimal state from the round:start payload so the game can begin
            // even if game:state hasn't arrived yet (slow connection / mid-game rejoin).
            return {
              roomCode,
              hostUserId: null,
              mode: mode as MultiplayerGameState["mode"],
              phase: "GUESSING" as const,
              currentRound: payload.round,
              totalRounds: payload.round,
              currentTrack: payload.track,
              players: {},
              timing: payload.timing,
              config: { autoAdvance: false, roundDurationMs: 20000 },
            } satisfies MultiplayerGameState
          }
          const multi = prev as MultiplayerGameState
          return {
            ...multi,
            phase: "GUESSING",
            currentRound: payload.round,
            currentTrack: payload.track,
            timing: payload.timing,
          }
        })
        setView("playing")
        dispatchLobby({ type: "playing" })
      }

      const roundRevealHandler = (payload: {
        roomCode: string
        round: number
        players: MultiplayerGameState["players"]
        timing: { startAt: number | null; revealAt: number | null }
      }) => {
        if (payload.roomCode !== roomCode) {
          return
        }
        if (mode === "streamer") {
          return
        }
        setGameState(prev => {
          if (!prev) return null
          const multi = prev as MultiplayerGameState
          return {
            ...multi,
            phase: "REVEAL",
            currentRound: payload.round,
            players: payload.players,
            timing: payload.timing,
          }
        })
      }

      const gameOverHandler = async (payload: { roomCode: string; players: MultiplayerGameState["players"] }) => {
        if (payload.roomCode !== roomCode) return
        setGameState(prev => {
          if (!prev) return null
          if (mode === "streamer") {
            const st = prev as StreamerState
            return { ...st, phase: "GAME_OVER" }
          }
          const multi = prev as MultiplayerGameState
          return { ...multi, phase: "FINISHED", players: payload.players }
        })
        try {
          const latest = await api.roomState(payload.roomCode)
          if (latest.tracks?.length) {
            setTracks(latest.tracks)
          }
        } catch (err) {
          console.error("room_state_results_sync_failed", err)
        }
        setView("results")
        dispatchLobby({ type: "results" })
      }

      const chatHandler = (payload: ChatMessage) => {
        setChatMessages(prev => [...prev, payload].slice(-100))
      }

      socket.on("room:presence", presenceHandler)
      socket.on("player-joined", playerJoinedHandler)
      socket.on("game:state", gameStateHandler)
      socket.on("state:sync", gameStateHandler)
      socket.on("game:round:start", roundStartHandler)
      socket.on("game:round:reveal", roundRevealHandler)
      socket.on("game:over", gameOverHandler)
      socket.on("game:game:over", gameOverHandler)
      socket.on("room:chat", chatHandler)

      handlersRef.current = {
        connect: undefined,
        presence: presenceHandler,
        playerJoined: playerJoinedHandler,
        gameState: gameStateHandler,
        roundStart: roundStartHandler,
        roundReveal: roundRevealHandler,
        gameOver: gameOverHandler,
        chat: chatHandler,
      }

      const emitJoin = () => {
        if (!userPayload?.user) return
        socket.emit("room:join", {
          roomCode,
          user: { id: userPayload.user.id, username: userPayload.user.username ?? undefined },
        })
      }

      const connectHandler = () => emitJoin()
      socket.on("connect", connectHandler)
      handlersRef.current.connect = connectHandler

      if (socket.connected) {
        emitJoin()
      }

      refreshParticipants(roomCode)

      ;(async () => {
        try {
          const latest = await api.roomState(roomCode)
          if (latest.tracks?.length) setTracks(latest.tracks)
          if (latest.gameState) {
            const gs = latest.gameState
            setGameState(gs)
            const nextView = resolveViewFromState(gs)
            setView(nextView)
            dispatchLobby({ type: viewToLobbyAction(nextView) })
          }
        } catch (err) {
          console.error("room_state_sync_failed", err)
        }
      })()
    },
    [ensureSocket, userPayload, refreshParticipants, resolveViewFromState, viewToLobbyAction, tracks.length, gameState, room?.host_user_id]
  )

  const handleCreateRoom = useCallback(
    async (skipSpotify?: boolean) => {
      audioManager.unlock()
      if (!requireSession({ type: "host" })) return
      if (!skipSpotify) {
        const ok = await ensureSpotify({ type: "host" })
        if (!ok) return
      }
      setRequireSpotify(false)
      if (!canHostNow && lobby.status !== "waiting") return
      if (lobby.status === "creating") return
      try {
        setError(null)
        dispatchLobby({ type: "creating" })
        setFlowStarted(true)
        autoStartGameRef.current = false
        const { room: created } = await api.createRoom({ questionCount: 10 })
        setRoom(created)
        setGameState(null)
        setView("hosting")
        dispatchLobby({ type: "created" })
        attachSocketListeners(created.room_code)
        const details = await api.roomDetails(created.room_code)
        setRoom(details.room)
        syncParticipants(details.participants)
      } catch (err) {
        console.error("create_room_failed", err)
        autoHostTriggered.current = false
        const message = friendlyError(mode, "create")
        setError(message)
        dispatchLobby({ type: "error", message })
      }
    },
    [attachSocketListeners, syncParticipants, mode, canHostNow, lobby.status, ensureSpotify, requireSession]
  )

  useEffect(() => {
    if (abortFlowRef.current) return
    if (loading) return
    if (!userPayload) {
      storePostAuthRedirect({ type: "host" })
      router.replace("/auth/login")
      return
    }
    if (intent === "host" && !autoHostTriggered.current && view === "landing" && !room && (lobby.status === "idle" || lobby.status === "error")) {
      autoHostTriggered.current = true
      handleCreateRoom()
    }
  }, [intent, view, room, handleCreateRoom, lobby.status, loading, userPayload, router, storePostAuthRedirect])

  useEffect(() => {
    if (abortFlowRef.current) return
    if (!modeConfig.lobby.autoStart) return
    if (!autojoin) return
    if (autoHostTriggered.current) return
    if (!flowStarted) return
    if (view === "landing" && !room && (lobby.status === "idle" || lobby.status === "error")) {
      autoHostTriggered.current = true
      handleCreateRoom()
    }
  }, [modeConfig.lobby.autoStart, view, room, handleCreateRoom, lobby.status, flowStarted, autojoin])

  const joinRoomCode = useCallback(
    async (code: string, skipSpotify?: boolean) => {
      const normalizedCode = code.trim().toUpperCase()
      if (!requireSession({ type: "join", code: normalizedCode })) {
        setJoinCode(normalizedCode)
        return
      }
      if (!skipSpotify) {
        const ok = await ensureSpotify({ type: "join", code })
        if (!ok) return
      }
      setRequireSpotify(false)
      if (joining || lobby.status === "joining") return
      if (!normalizedCode) {
        const message = friendlyError(mode, "join")
        setError(message)
        dispatchLobby({ type: "error", message })
        return
      }
      try {
        setJoining(true)
        setError(null)
        dispatchLobby({ type: "joining" })
        setFlowStarted(true)
        const { room: joined } = await api.joinRoom(normalizedCode)
        setRoom(joined)
        setGameState(null)
        setView("waiting")
        dispatchLobby({ type: "joined" })
        attachSocketListeners(joined.room_code)
        const details = await api.roomDetails(joined.room_code)
        setRoom(details.room)
        syncParticipants(details.participants)
      } catch (err) {
        console.error("join_room_failed", err)
        const message = friendlyError(mode, "join")
        setError(message)
        dispatchLobby({ type: "error", message })
      } finally {
        setJoining(false)
      }
    },
    [attachSocketListeners, joining, lobby.status, syncParticipants, mode, ensureSpotify, requireSession]
  )

  const handleJoinRoom = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      audioManager.unlock()
      joinRoomCode(joinCode)
    },
    [joinCode, joinRoomCode]
  )

  const handleAcceptInvite = useCallback(
    async (_invitationId: number, _skipSpotify?: boolean) => {
      // Invitations désactivées : tout passe par un code.
      setError("Les invitations sont désactivées. Rejoins avec un code.")
      dispatchLobby({ type: "error", message: "Les invitations sont désactivées. Rejoins avec un code." })
      return
    },
    [dispatchLobby, setError]
  )

  const handleStartGame = useCallback(
    async (skipSpotify?: boolean) => {
      audioManager.unlock()
      if (!room || !canStartGame) return
      if (!skipSpotify) {
        const ok = await ensureSpotify({ type: "host" })
        if (!ok) return
      }
      try {
        setStarting(true)
        setError(null)
        dispatchLobby({ type: "starting" })
        const payload: { source?: string; playlistId?: string; subMode?: string; soloSource?: string } = {
          source: "library",
        }
        if (mode === "streamer") {
          payload.subMode = streamerMode
          if (streamerMode === "solo") {
            payload.soloSource = soloSource
          }
        }
        const { tracks: generatedTracks, gameState: initialState } = await api.startMultiplayerGame(room.room_code, payload)
        setTracks(generatedTracks)
        if (initialState) {
          setGameState(initialState)
        } else {
          try {
            const latest = await api.roomState(room.room_code)
            if (latest.tracks?.length) setTracks(latest.tracks)
            if (latest.gameState) setGameState(latest.gameState)
          } catch (err) {
            console.error("start_game_resync_failed", err)
          }
        }
        setView("playing")
        dispatchLobby({ type: "playing" })
      } catch (err) {
        console.error("start_multiplayer_failed", err)
        const status = (err as { status?: number })?.status
        const code = (err as { error?: { code?: string } })?.error?.code
        if (status === 409 && code === "room_locked") {
          try {
            const latest = await api.roomState(room.room_code)
            if (latest.gameState) {
              const nextView = resolveViewFromState(latest.gameState)
              setGameState(latest.gameState)
              setView(nextView)
              dispatchLobby({ type: viewToLobbyAction(nextView) })
              return
            }
          } catch (syncErr) {
            console.error("start_game_resync_on_lock_failed", syncErr)
          }
        }
        const message =
          err instanceof ApiError && err.message
            ? err.message
            : friendlyError(mode, "start")
        setError(message)
        dispatchLobby({ type: "error", message })
      } finally {
        setStarting(false)
      }
    },
    [room, canStartGame, mode, ensureSpotify, resolveViewFromState, viewToLobbyAction, streamerMode, soloSource]
  )

  const handleSpotifyConnect = useCallback(() => {
    storePostAuthRedirect()
    const codeToPersist = pendingAction?.type === "join" ? pendingAction.code : joinCode
    if (codeToPersist) {
      try {
        window.localStorage.setItem(PENDING_EVENT_CODE_KEY, codeToPersist.toUpperCase())
      } catch {
        // ignore
      }
    }
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login"
    }
  }, [joinCode, pendingAction, storePostAuthRedirect])

  useEffect(() => {
    if (abortFlowRef.current) return
    if (!modeConfig.lobby.autoStart) return
    if (!autojoin) return
    if (!room) return
    if (!isHost) return
    if (lobby.status !== "hosting" && lobby.status !== "waiting") return
    if (starting) return
    const enoughPlayers = participants.length >= modeConfig.lobby.minPlayers
    if (enoughPlayers && !autoStartGameRef.current) {
      autoStartGameRef.current = true
      handleStartGame()
    }
  }, [modeConfig.lobby.autoStart, modeConfig.lobby.minPlayers, room, lobby.status, participants.length, starting, handleStartGame, isHost, autojoin])

  const handleInviteFriendToRoom = useCallback(async (_userId?: number) => {
    // Invitations suspendues : le flux passe uniquement par les codes de room.
    return Promise.resolve()
  }, [])

  const runPendingAction = useCallback(
    (action: PendingAction) => {
      switch (action.type) {
        case "host":
          handleCreateRoom(true)
          break
        case "join":
          joinRoomCode(action.code, true)
          break
        case "invite":
          // Invitations désactivées : pas d’action.
          break
        default:
          break
      }
    },
    [handleCreateRoom, joinRoomCode]
  )

  useEffect(() => {
    if (!pendingAction) return
    if (!hasSpotify) return
    runPendingAction(pendingAction)
    setPendingAction(null)
    setRequireSpotify(false)
  }, [pendingAction, hasSpotify, runPendingAction])

  // Effect to resume flow after Spotify auth return
  useEffect(() => {
    if (room) {
      setHasPendingAuthRestore(false)
      return
    }
    if (loading) return
    if (!userPayload) return

    try {
      // Check for pending auth redirect first
      const pendingRedirect = window.localStorage.getItem(PENDING_AUTH_REDIRECT_KEY)
      const pendingCode = window.localStorage.getItem(PENDING_EVENT_CODE_KEY)

      if (pendingRedirect || pendingCode) {
        // Clear storage immediately to prevent re-triggers
        window.localStorage.removeItem(PENDING_AUTH_REDIRECT_KEY)
        window.localStorage.removeItem(PENDING_EVENT_CODE_KEY)

        // Parse the pending redirect URL to determine intent
        if (pendingRedirect) {
          const url = new URL(pendingRedirect, window.location.origin)
          const pendingIntent = url.searchParams.get("intent")
          const pendingJoinCode = url.searchParams.get("code")

          if (pendingIntent === "host") {
            // User was trying to host before auth
            setFlowStarted(true)
            handleCreateRoom(true)
            return
          } else if (pendingJoinCode) {
            // User was trying to join with a code
            setJoinCode(pendingJoinCode.toUpperCase())
            setFlowStarted(true)
            joinRoomCode(pendingJoinCode, true)
            return
          }
        }

        // Fallback to legacy code-only storage
        if (pendingCode) {
          setJoinCode(pendingCode.toUpperCase())
          setFlowStarted(true)
          joinRoomCode(pendingCode, true)
          return
        }
      }
      // No pending data found, clear the flag
      setHasPendingAuthRestore(false)
    } catch {
      setHasPendingAuthRestore(false)
    }
  }, [room, loading, userPayload, handleCreateRoom, joinRoomCode])

  useEffect(() => {
    if (!room?.room_code) return
    const shouldPoll = view !== "results" && (view !== "playing" || !gameState)
    if (!shouldPoll) return
    const interval = setInterval(async () => {
      try {
        const latest = await api.roomState(room.room_code)
        if (latest.gameState) {
          const gs = latest.gameState
          setGameState(gs)
          const nextView = resolveViewFromState(gs)
          setView(nextView)
          dispatchLobby({ type: viewToLobbyAction(nextView) })
        }
        if (latest.tracks?.length) setTracks(latest.tracks)
      } catch (err) {
        console.error("lobby_state_poll_failed", err)
      }
    }, 2500)
    return () => clearInterval(interval)
  }, [room?.room_code, view, gameState, resolveViewFromState, viewToLobbyAction])

  useEffect(() => {
    if (!gameState) return
    const next = resolveViewFromState(gameState)
    if (next !== view) {
      setView(next)
      dispatchLobby({ type: viewToLobbyAction(next) })
    }
  }, [gameState, resolveViewFromState, viewToLobbyAction, view])

  const scores = useMemo(() => {
    if (mode === "streamer") return {}
    const next: Record<number, { username: string | null; score: number; accuracy: number }> = {}
    for (const participant of activeParticipants) {
      const snapshot = (gameState as MultiplayerGameState | null | undefined)?.players?.[participant.user_id]
      next[participant.user_id] = {
        username: participant.username,
        score: snapshot?.score ?? 0,
        accuracy: snapshot?.accuracy ?? 0,
      }
    }
    return next
  }, [activeParticipants, gameState, mode])

  const leaderboard = useMemo(() => {
    if (mode === "streamer") return []
    const state = gameState as MultiplayerGameState | null | undefined
    if (!state?.players) return []
    return Object.values(state.players)
      .map(p => ({
        userId: p.userId,
        username: p.username,
        score: p.score,
        accuracy: p.accuracy ?? 0,
        avatar: p.avatar,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.accuracy - a.accuracy
      })
  }, [gameState, mode])

  const handleLeaveRoom = useCallback(() => {
    abortFlowRef.current = true
    autoHostTriggered.current = false
    setGuest(false)
    if (room && userPayload) {
      socketRef.current?.emit("room:leave", { roomCode: room.room_code, userId: userPayload.user.id })
      socketRef.current?.emit("game:leave", { roomCode: room.room_code })
    }
    autoStartGameRef.current = false
    autoHostTriggered.current = false
    setRoom(null)
    setParticipants([])
    setTracks([])
    setGameState(null)
    setView("landing")
    setFlowStarted(false)
    dispatchLobby({ type: "reset" })
    router.replace(ENTRY_ROUTE[mode])
  }, [room, userPayload, router, mode])

  const handleChangeMode = useCallback(() => {
    setGuest(false)
    handleLeaveRoom()
    router.push("/modes?from=/multiplayer")
  }, [handleLeaveRoom, router, setGuest])

  useEffect(() => {
    const hasCode = Boolean(initialJoinCode)
    if (!modeConfig || !mode) return
    if (roomRef.current || room || autojoin) return
    if (loading) return
    // Check if there's pending auth data before redirecting
    try {
      const hasPendingAuth = window.localStorage.getItem(PENDING_AUTH_REDIRECT_KEY) ||
                             window.localStorage.getItem(PENDING_EVENT_CODE_KEY)
      if (hasPendingAuth) return // Don't redirect, let the auth restoration effect handle it
    } catch {
      // ignore
    }
    if (!intent && !hasCode) {
      router.replace(ENTRY_ROUTE[mode])
    }
  }, [modeConfig, mode, intent, room, autojoin, initialJoinCode, router, loading])

  useEffect(() => {
    if (abortFlowRef.current) return
    if (!initialJoinCode && !autojoin) return
    if (room) return
    const code = initialJoinCode ?? autojoin
    if (!code) return
    if (!requireSession({ type: "join", code })) {
      setJoinCode(code.toUpperCase())
      return
    }
    // For join-by-code, enforce Spotify only in streamer mode
    if (mode === "streamer" && !hasSpotify) {
      setJoinCode(code.toUpperCase())
      setRequireSpotify(true)
      return
    }
    joinRoomCode(code)
  }, [initialJoinCode, autojoin, room, joinRoomCode, hasSpotify, mode, requireSession])

  const dataAttrs = modeDataAttrs(mode)
  const headerCopy = HEADER_COPY[mode]

  useEffect(() => {
    if (loading) return
    if (!userPayload) {
      storePostAuthRedirect(
        pendingAction ?? (intent === "host"
          ? { type: "host" }
          : initialJoinCode
            ? { type: "join", code: initialJoinCode }
            : null),
      )
      router.replace("/auth/login")
    }
  }, [loading, userPayload, router, storePostAuthRedirect, pendingAction, intent, initialJoinCode])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-neon" />
      </div>
    )
  }

  if (!userPayload) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050505]">
        <Loader2 className="h-8 w-8 animate-spin text-white/50" />
      </div>
    )
  }

  const isPendingIntent =
    ((intent === "host" || Boolean(initialJoinCode) || Boolean(autojoin) || hasPendingAuthRestore) &&
    !room &&
    !requireSpotify &&
    lobby.status !== "error" &&
    (lobby.status === "creating" || lobby.status === "joining" || flowStarted || hasPendingAuthRestore))

  if (isPendingIntent) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050505] px-6 text-white/80">
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-white/70" />
          <p className="text-sm">Préparation du lobby…</p>
          <p className="text-xs text-white/50">Si l’attente dure, reviens au menu et relance.</p>
        </div>
      </div>
    )
  }

  const lobbyProps: LobbyRendererProps = {
    mode,
    modeConfig,
    view,
    lobbyStatus: lobby.status,
    joinCode,
    setJoinCode,
    joining,
    onHost: handleCreateRoom,
    onJoinSubmit: handleJoinRoom,
    room,
    participants: activeParticipants,
    scores,
    friends,
    friendsLoading,
    friendsError,
    activeFriends,
    onQuickJoin: joinRoomCode,
    onInviteFriend: handleInviteFriendToRoom,
    onStart: handleStartGame,
    starting,
    invites,
    onAcceptInvite: handleAcceptInvite,
    canStart: canStartGame,
    isHost,
    isGuest,
    currentUserId,
  }

  const streamerModeSelector =
    mode === "streamer" && view !== "playing" && view !== "results" ? (
      <div className="rounded-2xl border border-white/10 bg-[#0b0b0b] p-4 text-white">
        <p className="text-xs uppercase tracking-[0.32em] text-white/60">Gameplay</p>
        <h3 className="text-lg font-semibold">Choisis le format</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {[
            { key: "viewers_only", title: "Chat avec ta musique", desc: "Le chat joue avec tes musiques", value: "viewers_only" as StreamerSubMode },
            { key: "duo", title: "Toi avec leur musique", desc: "Tu joues avec les musiques du chat", value: "duo" as StreamerSubMode },
            { key: "solo", title: "Vous deux ensemble", desc: "Les deux jouent avec les deux musiques", value: "solo" as StreamerSubMode },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStreamerMode(opt.value)}
              className={`rounded-xl border px-3 py-3 text-left transition ${streamerMode === opt.value ? "border-white/60 bg-white/10" : "border-white/15 bg-[#0f0f0f]"}`}
            >
              <p className="text-sm font-semibold">{opt.title}</p>
              <p className="text-xs text-white/60">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>
    ) : null

  const selectedLobby = (() => {
    switch (mode) {
      case "friends":
        return <FriendsLobbyView {...lobbyProps} />
      case "event":
        return <EventLobbyView {...lobbyProps} />
      case "streamer":
        return <StreamerLobbyView {...lobbyProps} />
      default:
        return null
    }
  })()

  const stage: "entry" | "lobby" | "game" | "results" =
    view === "playing" ? "game" : view === "results" ? "results" : view === "landing" ? "entry" : "lobby"

  const spotifyPrompt = requireSpotify ? (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/80 px-6 text-center">
      <div className="max-w-md rounded-3xl border border-white/10 bg-[var(--ma-surface,#0b0b0b)] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--ma-muted)]">Spotify requis</p>
        <h3 className="mt-3 text-2xl font-semibold text-white">Connecte ton Spotify</h3>
        <p className="mt-2 text-sm text-[var(--ma-muted)]">
          Les musiques sont tirées des comptes des joueurs. Connecte-toi pour rejoindre la salle {joinCode || "(code)"}.
        </p>
        <p className="mt-2 text-xs text-[var(--ma-muted)]">Après connexion, tu entres directement dans la room.</p>
        <Button onClick={() => {
          handleSpotifyConnect()
          setRequireSpotify(false)
        }} className="mt-6 w-full justify-center rounded-xl">
          Se connecter à Spotify
        </Button>
      </div>
    </div>
  ) : null

  // Guest mode no longer supported - all users must use Spotify
  const guestNotice = null

  const loadingGame =
    view === "playing" && room && !gameState ? (
      <div className="grid min-h-[50vh] place-items-center text-center text-sm text-white/70">
        <div className="space-y-3">
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
          <p>Synchronisation de la partie…</p>
          <p className="text-xs text-white/50">Si rien ne se passe, reste sur cette page quelques secondes.</p>
        </div>
      </div>
    ) : null

  const content =
    view === "playing" && gameState && room ? (
      mode === "streamer" ? (
        <StreamerGameClient
          userId={userPayload.user.id}
          state={gameState as StreamerState}
          serverNow={serverNow}
          onChatGuess={guess => {
            const socket = socketRef.current
            if (!socket) return
            socket.emit("game:guess", { roomCode: room.room_code, guess })
          }}
          onHostGuess={guess => {
            const socket = socketRef.current
            if (!socket) return
            socket.emit("game:guess", { roomCode: room.room_code, guess })
          }}
          onHostStart={() => {
            const socket = socketRef.current
            if (!socket) return
            socket.emit("host:start", { roomCode: room.room_code })
          }}
          onExit={handleLeaveRoom}
          accent={accentColor}
        />
      ) : (
        <MultiplayerGameClient
          user={userPayload.user}
          state={gameState as MultiplayerGameState}
          serverNow={serverNow}
          onAnswer={(guessTitle, guessArtist, sourceUserId) => {
            const socket = socketRef.current
            if (!socket) return
            socket.emit("game:answer", { roomCode: room.room_code, guessTitle, guessArtist, sourceUserId })
          }}
          onReady={() => {
            const socket = socketRef.current
            if (!socket) return
            socket.emit("game:ready", { roomCode: room.room_code })
          }}
          mode={mode}
          modeConfig={modeConfig}
          accentColor={accentColor}
          onExit={handleLeaveRoom}
          onRematch={isHost ? async () => {
            try {
              const { tracks: newTracks, gameState: newState } = await api.startMultiplayerGame(room.room_code, { source: "library" })
              setTracks(newTracks)
              if (newState) setGameState(newState)
            } catch (err) {
              console.error("rematch_failed", err)
            }
          } : undefined}
          chatMessages={chatMessages}
          onSendChat={(message) => {
            const socket = socketRef.current
            if (!socket || !room) return
            socket.emit("room:chat", { roomCode: room.room_code, message })
          }}
        />
      )
    ) : view === "results" ? (
      <ResultsView
        leaderboard={leaderboard}
        tracks={tracks}
        currentUserId={currentUserId}
        accentColor={accentColor}
        onReturn={() => router.replace("/modes")}
        onReplay={async () => {
          if (!room || !isHost) return
          try {
            setView("playing")
            dispatchLobby({ type: "playing" })
            const { tracks: newTracks, gameState: newState } = await api.startMultiplayerGame(room.room_code, { source: "library" })
            setTracks(newTracks)
            if (newState) setGameState(newState)
          } catch (err) {
            console.error("replay_failed", err)
            // Fallback: reset to lobby
            autoStartGameRef.current = false
            autoHostTriggered.current = false
            setView("landing")
            setRoom(null)
            setParticipants([])
            setTracks([])
            setGameState(null)
            setFlowStarted(false)
            dispatchLobby({ type: "reset" })
          }
        }}
      />
    ) : loadingGame ? (
      loadingGame
    ) : (
      <>
        {streamerModeSelector}
        {selectedLobby}
      </>
    )

  return (
    <LobbyShell
      mode={mode}
      title={headerCopy.title}
      subtitle={headerCopy.subtitle}
      onLeave={handleLeaveRoom}
      onChangeMode={handleChangeMode}
      hideHeader={view === "results" || view === "playing"}
      error={error || lobby.message}
      dataAttrs={dataAttrs}
      stage={stage}
    >
      <div className="flex flex-col gap-4">
        {guestNotice}
        {content}
        {spotifyPrompt}
      </div>
    </LobbyShell>
  )
}
