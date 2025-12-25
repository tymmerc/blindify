"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Socket } from "socket.io-client"
import { Loader2 } from "lucide-react"
import { getSocket, disconnectSocket } from "@/lib/socket"
import { api } from "@/lib/api"
import type { CurrentUserPayload } from "@/lib/api"
import type { MultiplayerGameState, MultiplayerParticipant, MultiplayerRoom, SoloTrack } from "@/lib/types"
import { MultiplayerGameClient } from "@/components/game/MultiplayerGameClient"
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
import { ChatLobbyView } from "./ChatLobbyView"
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
    chat: {
      create: "Le salon live ne peut pas s’ouvrir. Patiente un instant.",
      join: "Rejoindre le flux a échoué. Relance et reste dans le chat.",
      start: "Le flux ne démarre pas. Réessaie.",
      invite: "Inviter n’est pas disponible pour ce mode.",
    },
  } as const
  return base[mode][phase]
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

  const [room, setRoom] = useState<MultiplayerRoom | null>(null)
  const [participants, setParticipants] = useState<MultiplayerParticipant[]>([])

  const [tracks, setTracks] = useState<SoloTrack[]>([])
  const [gameState, setGameState] = useState<MultiplayerGameState | null>(null)
  const [starting, setStarting] = useState(false)
  const [joining, setJoining] = useState(false)
  const abortFlowRef = useRef(false)

  // Invitations / amis désactivés : on reste sur le code de room uniquement.
  const friends: FriendEntry[] = []
  const friendsLoading = false
  const friendsError: string | null = null
  const activeFriends: ActiveFriend[] = []
  const invites: RoomInvitation[] = []

  const socketRef = useRef<Socket | null>(null)
  const handlersRef = useRef<{
    presence?: (payload: RoomPresenceEvent) => void
    playerJoined?: (payload: { userId: number; username?: string | null; roomCode: string }) => void
    gameState?: (payload: MultiplayerGameState) => void
    roundStart?: (payload: { roomCode: string; round: number; track: MultiplayerGameState["currentTrack"]; timing: { startAt: number | null; revealAt: number | null } }) => void
    roundReveal?: (payload: { roomCode: string; round: number; players: MultiplayerGameState["players"]; timing: { startAt: number | null; revealAt: number | null } }) => void
    gameOver?: (payload: { roomCode: string; players: MultiplayerGameState["players"] }) => void
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
  const canStartGame =
    isHost &&
    (lobby.status === "hosting" || lobby.status === "waiting") &&
    participants.length >= modeConfig.lobby.minPlayers &&
    !starting
  const hasSpotify = Boolean(userPayload?.providerConnection?.provider === "spotify")

  useEffect(() => {
    if (initialJoinCode) setJoinCode(initialJoinCode.toUpperCase())
  }, [initialJoinCode])

  useEffect(() => {
    let active = true
    async function bootstrap() {
      try {
        const guestProfile = getOrCreateGuest()
        const me = await api.ensureUserSession(guestProfile.name)
        if (!active) return
        if (!me) {
          setError("Impossible de créer une session invité.")
          return
        }
        setUserPayload(me)
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
        if (handlersRef.current.presence) socket.off("room:presence", handlersRef.current.presence)
        if (handlersRef.current.playerJoined) socket.off("player-joined", handlersRef.current.playerJoined)
        if (handlersRef.current.gameState) socket.off("game:state", handlersRef.current.gameState)
        if (handlersRef.current.roundStart) socket.off("game:round:start", handlersRef.current.roundStart)
        if (handlersRef.current.roundReveal) socket.off("game:round:reveal", handlersRef.current.roundReveal)
        if (handlersRef.current.gameOver) {
          socket.off("game:over", handlersRef.current.gameOver)
          socket.off("game:game:over", handlersRef.current.gameOver)
        }
      }
      disconnectSocket()
    }
  }, [router])

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => {
    userRef.current = userPayload
  }, [userPayload])

  const ensureSocket = useCallback((): Socket => {
    if (!socketRef.current) {
      socketRef.current = getSocket()
    }
    return socketRef.current
  }, [])

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

  const ensureSpotify = useCallback(
    async (next: PendingAction): Promise<boolean> => {
      if (isGuest) return true
      if (hasSpotify) return true
      try {
        await api.getSpotifyToken()
        return true
      } catch (err) {
        console.error("spotify_required", err)
        setPendingAction(next)
        setRequireSpotify(true)
        return false
      }
    },
    [hasSpotify, isGuest]
  )

  const attachSocketListeners = useCallback(
    (roomCode: string) => {
      const socket = ensureSocket()

      if (handlersRef.current.presence) socket.off("room:presence", handlersRef.current.presence)
      if (handlersRef.current.playerJoined) socket.off("player-joined", handlersRef.current.playerJoined)
      if (handlersRef.current.gameState) socket.off("game:state", handlersRef.current.gameState)
      if (handlersRef.current.roundStart) socket.off("game:round:start", handlersRef.current.roundStart)
      if (handlersRef.current.roundReveal) socket.off("game:round:reveal", handlersRef.current.roundReveal)
      if (handlersRef.current.gameOver) {
        socket.off("game:over", handlersRef.current.gameOver)
        socket.off("game:game:over", handlersRef.current.gameOver)
      }

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

      const gameStateHandler = (payload: MultiplayerGameState) => {
        if (payload.roomCode !== roomCode) return
        setGameState(payload)
        setView(payload.status === "finished" ? "results" : "playing")
        dispatchLobby({ type: payload.status === "finished" ? "results" : "playing" })
      }

      const roundStartHandler = (payload: {
        roomCode: string
        round: number
        track: MultiplayerGameState["currentTrack"]
        timing: { startAt: number | null; revealAt: number | null }
      }) => {
        if (payload.roomCode !== roomCode) return
        setView("playing")
        setGameState(prev => {
          const fallbackTotal = prev?.totalRounds ?? tracks.length ?? gameState?.totalRounds ?? 10
          const base = prev ?? {
            roomCode,
            hostUserId: room?.host_user_id ?? null,
            status: "playing" as const,
            currentRound: payload.round,
            totalRounds: fallbackTotal,
            currentTrack: payload.track,
            timing: payload.timing,
            players: {},
          }
          return {
            ...base,
            status: "playing",
            currentRound: payload.round,
            currentTrack: payload.track,
            timing: payload.timing,
          }
        })
      }

      const roundRevealHandler = (payload: {
        roomCode: string
        round: number
        players: MultiplayerGameState["players"]
        timing: { startAt: number | null; revealAt: number | null }
      }) => {
        if (payload.roomCode !== roomCode) return
        setGameState(prev => {
          if (!prev) return prev
          return {
            ...prev,
            status: "reveal",
            currentRound: payload.round,
            players: payload.players,
            timing: payload.timing,
          }
        })
      }

      const gameOverHandler = async (payload: { roomCode: string; players: MultiplayerGameState["players"] }) => {
        if (payload.roomCode !== roomCode) return
        setGameState(prev => (prev ? { ...prev, status: "finished", players: payload.players } : prev))
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

      socket.on("room:presence", presenceHandler)
      socket.on("player-joined", playerJoinedHandler)
      socket.on("game:state", gameStateHandler)
      socket.on("game:round:start", roundStartHandler)
      socket.on("game:round:reveal", roundRevealHandler)
      socket.on("game:over", gameOverHandler)
      socket.on("game:game:over", gameOverHandler)

      handlersRef.current = {
        presence: presenceHandler,
        playerJoined: playerJoinedHandler,
        gameState: gameStateHandler,
        roundStart: roundStartHandler,
        roundReveal: roundRevealHandler,
        gameOver: gameOverHandler,
      }

      if (userPayload?.user) {
        socket.emit("room:join", {
          roomCode,
          user: { id: userPayload.user.id, username: userPayload.user.username ?? undefined },
        })
      }

      refreshParticipants(roomCode)

      ;(async () => {
        try {
          const latest = await api.roomState(roomCode)
          if (latest.tracks?.length) setTracks(latest.tracks)
          if (latest.gameState) {
            setGameState(latest.gameState as MultiplayerGameState)
            setView(latest.gameState.status === "finished" ? "results" : "playing")
            dispatchLobby({ type: latest.gameState.status === "finished" ? "results" : "playing" })
          }
        } catch (err) {
          console.error("room_state_sync_failed", err)
        }
      })()
    },
    [ensureSocket, userPayload, refreshParticipants, tracks.length, gameState, room?.host_user_id]
  )

  const handleCreateRoom = useCallback(
    async (skipSpotify?: boolean) => {
      if (!skipSpotify) {
        const ok = await ensureSpotify({ type: "host" })
        if (!ok) return
      }
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
    [attachSocketListeners, syncParticipants, mode, canHostNow, lobby.status, ensureSpotify]
  )

  useEffect(() => {
    if (abortFlowRef.current) return
    if (intent === "host" && !autoHostTriggered.current && view === "landing" && !room && (lobby.status === "idle" || lobby.status === "error")) {
      autoHostTriggered.current = true
      handleCreateRoom()
    }
  }, [intent, view, room, handleCreateRoom, lobby.status])

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
      if (!skipSpotify) {
        const ok = await ensureSpotify({ type: "join", code })
        if (!ok) return
      }
      if (joining || lobby.status === "joining") return
      const normalizedCode = code.trim().toUpperCase()
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
    [attachSocketListeners, joining, lobby.status, syncParticipants, mode, ensureSpotify]
  )

  const handleJoinRoom = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
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
      if (!room || !canStartGame) return
      if (!skipSpotify) {
        const ok = await ensureSpotify({ type: "host" })
        if (!ok) return
      }
      try {
        setStarting(true)
        setError(null)
        dispatchLobby({ type: "starting" })
        const payload: { source?: string; playlistId?: string } = {
          source: "library",
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
        const message = friendlyError(mode, "start")
        setError(message)
        dispatchLobby({ type: "error", message })
      } finally {
        setStarting(false)
      }
    },
    [room, canStartGame, mode, ensureSpotify]
  )

  const handleSpotifyConnect = useCallback(() => {
    const url = api.getProviderLoginUrl("spotify")
    if (typeof window !== "undefined") {
      window.location.href = url
    }
  }, [])

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

  useEffect(() => {
    if (!room?.room_code) return
    if (view === "playing" || view === "results") return
    const interval = setInterval(async () => {
      try {
        const latest = await api.roomState(room.room_code)
        if (latest.gameState) {
          setGameState(latest.gameState as MultiplayerGameState)
          setView(latest.gameState.status === "finished" ? "results" : "playing")
          dispatchLobby({ type: latest.gameState.status === "finished" ? "results" : "playing" })
        }
        if (latest.tracks?.length) setTracks(latest.tracks)
      } catch (err) {
        console.error("lobby_state_poll_failed", err)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [room?.room_code, view])

  const scores = useMemo(() => {
    const next: Record<number, { username: string | null; score: number; accuracy: number }> = {}
    for (const participant of participants) {
      const snapshot = gameState?.players?.[participant.user_id]
      next[participant.user_id] = {
        username: participant.username,
        score: snapshot?.score ?? 0,
        accuracy: snapshot?.accuracy ?? 0,
      }
    }
    return next
  }, [participants, gameState?.players])

  const leaderboard = useMemo(() => {
    if (!gameState?.players) return []
    return Object.values(gameState.players)
      .map(p => ({ userId: p.userId, username: p.username, score: p.score, accuracy: p.accuracy, avatar: p.avatar }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.accuracy - a.accuracy
      })
  }, [gameState?.players])

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
    if (!intent && !hasCode) {
      router.replace(ENTRY_ROUTE[mode])
    }
  }, [modeConfig, mode, intent, room, autojoin, initialJoinCode, router])

  useEffect(() => {
    if (abortFlowRef.current) return
    if (!initialJoinCode && !autojoin) return
    if (room) return
    const code = initialJoinCode ?? autojoin
    if (!code) return
    joinRoomCode(code)
  }, [initialJoinCode, autojoin, room, joinRoomCode])

  const dataAttrs = modeDataAttrs(mode)
  const headerCopy = HEADER_COPY[mode]

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-neon" />
      </div>
    )
  }

  if (!userPayload) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="surface max-w-md rounded-3xl border border-white/10 p-8 text-center text-sm text-slate-200">
          <p>{error || "Impossible de préparer une session invité."}</p>
          <Button variant="outline" onClick={() => router.replace("/auth/login")} className="mt-4">
            Retour
          </Button>
        </div>
      </div>
    )
  }

  const isPendingIntent =
    (intent === "host" || Boolean(initialJoinCode) || Boolean(autojoin)) &&
    !room &&
    (view === "landing" || lobby.status === "creating" || lobby.status === "joining")

  if (isPendingIntent) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050505] px-6 text-white/80">
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-white/70" />
          <p className="text-sm">Préparation du lobby…</p>
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
    participants,
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

  const selectedLobby = (() => {
    switch (mode) {
      case "friends":
        return <FriendsLobbyView {...lobbyProps} />
      case "event":
        return <EventLobbyView {...lobbyProps} />
      case "chat":
        return <ChatLobbyView {...lobbyProps} />
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
        <h3 className="mt-3 text-2xl font-semibold text-white">Blindify joue avec TA musique</h3>
        <p className="mt-2 text-sm text-[var(--ma-muted)]">
          {mode === "friends"
            ? "Chacun joue avec sa bibliothèque. Connecte-toi pour lancer."
            : mode === "event"
              ? "Les titres viennent des bibliothèques des joueurs. Connecte-toi pour démarrer."
              : "Le salon tourne sur les musiques du chat. Connecte-toi pour participer."}
        </p>
        <p className="mt-2 text-xs text-[var(--ma-muted)]">Après connexion, on reprend automatiquement.</p>
        <Button onClick={handleSpotifyConnect} className="mt-6 w-full justify-center rounded-xl">
          Se connecter à Spotify
        </Button>
      </div>
    </div>
  ) : null

  const guestNotice =
    isGuest && view !== "results" ? (
      <div className="rounded-2xl border border-white/12 bg-[#0c0c0c] px-5 py-4 text-sm text-white/75">
        Mode invité : audio non disponible, mais tu peux répondre et observer comme les autres.
      </div>
    ) : null

  const content =
    view === "playing" && gameState && room ? (
      <MultiplayerGameClient
        user={userPayload.user}
        state={gameState}
        serverNow={serverNow}
        onAnswer={(guess, sourceUserId) => {
          const socket = socketRef.current
          if (!socket) return
          socket.emit("game:answer", { roomCode: room.room_code, guess, sourceUserId })
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
      />
    ) : view === "results" ? (
      <ResultsView
        leaderboard={leaderboard}
        tracks={tracks}
        currentUserId={currentUserId}
        accentColor={accentColor}
        onReturn={() => router.replace("/modes")}
        onReplay={() => {
          autoStartGameRef.current = false
          autoHostTriggered.current = false
          setView("landing")
          setRoom(null)
          setParticipants([])
          setTracks([])
          setGameState(null)
          setFlowStarted(false)
          dispatchLobby({ type: "reset" })
        }}
      />
    ) : (
      selectedLobby
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
