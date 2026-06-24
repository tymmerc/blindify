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
import { MultiplayerGameClient } from "@/components/game/MultiplayerGameClient"
import { useRoomChat } from "./hooks/useRoomChat"
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
  initialProfileUrl?: string | null
  initialNickname?: string | null
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

export function ModeLobbyView({ mode, modeConfig, intent, initialJoinCode, autojoin, initialProfileUrl, initialNickname }: ModeLobbyViewProps) {
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

  // Debloque l'autoplay des le lobby : le premier clic (pseudo, chat, copier
  // le code...) suffit. Sans ca, les non-hosts devaient cliquer sur "play"
  // au round 1 parce que le navigateur bloquait l'audio sans geste prealable.
  useEffect(() => {
    const unlock = () => {
      audioManager.warmup()
      document.removeEventListener("pointerdown", unlock)
    }
    document.addEventListener("pointerdown", unlock)
    return () => document.removeEventListener("pointerdown", unlock)
  }, [])

  const [tracks, setTracks] = useState<SoloTrack[]>([])
  const [gameState, setGameState] = useState<MultiplayerGameState | StreamerState | null>(null)
  const [starting, setStarting] = useState(false)
  const [joining, setJoining] = useState(false)
  const [importing, setImporting] = useState(false)
  // Bandeau d'erreur transitoire (room:error socket, resync...) - auto-efface.
  const [socketNotice, setSocketNotice] = useState<string | null>(null)
  // Signal incrementiel : un refus serveur d'une reponse doit sortir l'UI de
  // l'etat optimiste "Envoyee" (sinon le joueur croit avoir repondu).
  const [answerRejectSignal, setAnswerRejectSignal] = useState(0)
  // Bootstrap rate-limite (429) : message au lieu d'un spinner infini.
  const [rateLimited, setRateLimited] = useState(false)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showNotice = useCallback((msg: string, isAnswerReject = false) => {
    setSocketNotice(msg)
    if (isAnswerReject) setAnswerRejectSignal(x => x + 1)
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setSocketNotice(null), 6000)
  }, [])
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

  // Room chat (listener + send). Hook attaches when socket+roomCode ready.
  const { messages: chatMessages, sendChat } = useRoomChat(
    socketConnected ? socketRef.current : null,
    room?.room_code ?? null
  )
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
    roomError?: (payload: { code?: string; message?: string }) => void
  }>({})
  const roomRef = useRef<MultiplayerRoom | null>(null)
  const gameStateRef = useRef<MultiplayerGameState | StreamerState | null>(null)
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
    !starting &&
    !importing
  const hasSpotify = Boolean(userPayload?.providerConnection?.provider === "spotify")

  useEffect(() => {
    if (initialJoinCode) setJoinCode(initialJoinCode.toUpperCase())
  }, [initialJoinCode])

  useEffect(() => {
    let active = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    async function bootstrap() {
      try {
        setRateLimited(false)
        // Check for existing session
        const existing = await api.checkAuth()
        if (!active) return

        if (existing) {
          setGuest(existing.user.provider === "guest")
          setUserPayload(existing)
        } else {
          // No session — auto-create a guest session
          try {
            const guest = await api.ensureUserSession(initialNickname || "Joueur")
            if (!active) return
            if (guest) {
              setGuest(true)
              setUserPayload(guest)
            } else {
              storePostAuthRedirect()
              const ret = window.location.pathname + window.location.search
              router.replace(`/auth/login?returnTo=${encodeURIComponent(ret)}`)
              return
            }
          } catch (guestErr) {
            const gstatus = (guestErr as { status?: number })?.status
            if (gstatus === 429) {
              setRateLimited(true)
              retryTimer = setTimeout(() => { if (active) bootstrap() }, 4000)
              return
            }
            storePostAuthRedirect()
            const ret = window.location.pathname + window.location.search
            router.replace(`/auth/login?returnTo=${encodeURIComponent(ret)}`)
            return
          }
        }
      } catch (err) {
        if (!active) return
        const status = (err as { status?: number })?.status
        if (status === 429) {
          // Trop de requetes : message + retry auto (au lieu d'un spinner infini).
          setRateLimited(true)
          retryTimer = setTimeout(() => { if (active) bootstrap() }, 4000)
          return
        }
        // Autre erreur reseau : laisser l'utilisateur reessayer manuellement.
        setRateLimited(false)
        setError("Connexion impossible pour l'instant. Verifie ta connexion et reessaie.")
      } finally {
        if (active) setLoading(false)
      }
    }
    bootstrap()

    return () => {
      active = false
      if (retryTimer) clearTimeout(retryTimer)
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
        if (handlersRef.current.roomError) socket.off("room:error", handlersRef.current.roomError)
      }
      disconnectSocket()
    }
  }, [router, isGuest, setGuest])

  useEffect(() => {
    roomRef.current = room
  }, [room])

  // Filet anti-gel : si on reste bloque en REVEAL trop longtemps (un game:ready
  // perdu empeche tout le monde d'avancer), on resynchronise une fois via
  // game:sync et on previent le joueur. Borne a un seul declenchement par phase.
  useEffect(() => {
    const gs = gameState as MultiplayerGameState | null
    if (!gs || gs.phase !== "REVEAL" || !room) return
    const round = gs.currentRound
    const t = setTimeout(() => {
      const socket = socketRef.current
      if (!socket?.connected) return
      const still = gameStateRef.current as MultiplayerGameState | null
      if (still?.phase === "REVEAL" && still.currentRound === round) {
        socket.emit("game:sync", { roomCode: room.room_code })
        socket.emit("game:ready", { roomCode: room.room_code })
        showNotice("Resynchronisation de la partie…")
      }
    }, 25000)
    return () => clearTimeout(t)
  }, [gameState, room, showNotice])

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  useEffect(() => {
    userRef.current = userPayload
    // Don't automatically set guest mode based on provider
    // Guest mode is now explicitly controlled by user choice
  }, [userPayload, setGuest])

  // Phase 3 of refactor: stuck-state safety nets removed.
  // Previously two useEffect hooks polled `serverNow` and re-emitted
  // game:sync / game:ready when the phase appeared frozen. Those were patches
  // for socket reliability issues that have since been fixed (autoConnect:false,
  // markReconnected on every event, disconnected flag persistence).
  // If a "stuck" state appears now, it's a real bug — fix it server-side.

  // Safety net: ensure socket joins the room whenever we have a room and socket is connected
  // Track the last socket ID + room combo to re-emit on reconnect
  const lastJoinKeyRef = useRef<string | null>(null)
  // Re-join bulletproof : peu importe l'ordre (connect avant que la room
  // existe — cas HOST qui cree la room — ou room avant connect), on (re)joint
  // la room COURANTE (via roomRef) a chaque connexion. Sans ca, le socket du
  // host pouvait connecter avant la creation de la room et ne jamais rejoindre
  // la io room -> ne recevait aucun broadcast (jamais de reveal). Idempotent
  // cote backend.
  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !userPayload?.user) return
    const user = userPayload.user
    const joinCurrentRoom = () => {
      const rc = roomRef.current?.room_code
      if (!rc) return
      const joinKey = `${socket.id ?? "?"}:${rc}`
      if (lastJoinKeyRef.current === joinKey) return
      lastJoinKeyRef.current = joinKey
      socket.emit("room:join", { roomCode: rc, user: { id: user.id, username: user.username ?? undefined } })
    }
    socket.on("connect", joinCurrentRoom)
    if (socket.connected) joinCurrentRoom()
    return () => { socket.off("connect", joinCurrentRoom) }
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
    }
    // Connect if not already connected (autoConnect is disabled)
    if (!socketRef.current.connected) {
      socketRef.current.connect()
    }
    if (socketRef.current.connected) {
      setSocketConnected(true)
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
      } catch (err) {
        // Room not found → expired or deleted
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          setError("La salle a expiré ou a été fermée. Crée-en une nouvelle.")
          dispatchLobby({ type: "error", message: "room_expired" })
          setRoom(null)
        }
        // ignore other transient errors
      }
    },
    [syncParticipants]
  )

  useEffect(() => {
    if (!room?.room_code) return
    if (view !== "hosting" && view !== "waiting") return
    // Refresh immediat (et re-sync a chaque (re)connexion socket).
    refreshParticipants(room.room_code)
    // Socket connecte = il pousse les presences en temps reel -> AUCUN polling.
    // Socket tombe = polling de secours toutes les 4s seulement.
    if (socketConnected) return
    const interval = setInterval(() => refreshParticipants(room.room_code), 4000)
    return () => clearInterval(interval)
  }, [room?.room_code, view, socketConnected, refreshParticipants])

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
      const currentPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : ""
      const returnTo = currentPath ? `?returnTo=${encodeURIComponent(currentPath)}` : ""
      router.replace(`/auth/login${returnTo}`)
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
      if (handlersRef.current.roomError) socket.off("room:error", handlersRef.current.roomError)

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
        // The backend now emits `game:state` BEFORE `game:round:start`, so we
        // can trust that gameState is already set with the correct round data.
        // This handler only triggers UI transitions (no state reconstruction).
        setGameState(prev => {
          if (!prev) return prev // ignore round:start before game:state arrives
          const multi = prev as MultiplayerGameState
          // Defensive: if state.currentRound is behind, sync from the trigger event.
          if (multi.currentRound !== payload.round) {
            return {
              ...multi,
              phase: "GUESSING",
              currentRound: payload.round,
              currentTrack: payload.track,
              timing: payload.timing,
            }
          }
          return multi
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

      // Chat listener is owned by the useRoomChat hook at component top-level.

      socket.on("room:presence", presenceHandler)
      socket.on("player-joined", playerJoinedHandler)
      socket.on("game:state", gameStateHandler)
      socket.on("state:sync", gameStateHandler)
      socket.on("game:round:start", roundStartHandler)
      socket.on("game:round:reveal", roundRevealHandler)
      socket.on("game:over", gameOverHandler)
      socket.on("game:game:over", gameOverHandler)

      const roomErrorHandler = (payload: { code?: string; message?: string }) => {
        const msg = payload?.message || "Une action a ete refusee par le serveur."
        // Un refus d'acces a la salle = on a probablement perdu notre place :
        // re-emettre room:join pour se reinscrire au lieu de rester muet.
        if (payload?.code === "forbidden" || /acc[eè]s/i.test(msg)) {
          socket.emit("room:join", {
            roomCode,
            user: userPayload?.user ? { id: userPayload.user.id, username: userPayload.user.username ?? undefined } : undefined,
          })
        }
        // Messages benins (fin de partie / room nettoyee) : l'auto-ready peut
        // emettre game:ready apres la fin -> "Aucune partie en cours". Ne pas
        // alarmer le joueur avec ca.
        if (/aucune partie|introuvable/i.test(msg)) return
        // Si c'est un refus de reponse, sortir l'UI de l'etat "Envoyee".
        const isAnswerReject = /r[eé]ponse|acc[eè]s/i.test(msg)
        showNotice(msg, isAnswerReject)
      }
      socket.on("room:error", roomErrorHandler)

      handlersRef.current = {
        connect: undefined,
        presence: presenceHandler,
        playerJoined: playerJoinedHandler,
        gameState: gameStateHandler,
        roundStart: roundStartHandler,
        roundReveal: roundRevealHandler,
        gameOver: gameOverHandler,
        roomError: roomErrorHandler,
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
    [ensureSocket, userPayload, refreshParticipants, resolveViewFromState, viewToLobbyAction, tracks.length, gameState, room?.host_user_id, showNotice]
  )

  const handleCreateRoom = useCallback(
    async (skipSpotify?: boolean) => {
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
        const { room: created } = await api.createRoom({ questionCount: 10, nickname: initialNickname || undefined })
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
        const message = err instanceof ApiError && err.message ? err.message : friendlyError(mode, "create")
        setError(message)
        dispatchLobby({ type: "error", message })
        setFlowStarted(false)
      }
    },
    [attachSocketListeners, syncParticipants, mode, canHostNow, lobby.status, ensureSpotify, requireSession]
  )

  useEffect(() => {
    if (abortFlowRef.current) return
    if (loading) return
    // Don't redirect here — the bootstrap effect already handles auth redirect
    // Just wait for userPayload to be available before auto-creating
    if (!userPayload) return
    if (intent === "host" && !autoHostTriggered.current && view === "landing" && !room && (lobby.status === "idle" || lobby.status === "error")) {
      autoHostTriggered.current = true
      handleCreateRoom()
    }
  }, [intent, view, room, handleCreateRoom, lobby.status, loading, userPayload])

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
        const { room: joined } = await api.joinRoom(normalizedCode, initialNickname || undefined)
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
        const message = err instanceof ApiError && err.message ? err.message : friendlyError(mode, "join")
        setError(message)
        dispatchLobby({ type: "error", message })
        setFlowStarted(false)
      } finally {
        setJoining(false)
      }
    },
    [attachSocketListeners, joining, lobby.status, syncParticipants, mode, ensureSpotify, requireSession]
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
        // Pre-warm the audio element during this user interaction (click).
        // This unlocks autoplay so the round start audio plays without manual click.
        audioManager.warmup()
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
      window.location.href = `/blindify/auth/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
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

  // HTTP polling fallback: only runs when the socket is NOT connected.
  // With a healthy socket, `game:state` events deliver updates in real time —
  // polling becomes a network-failure safety net rather than the primary path.
  useEffect(() => {
    if (!room?.room_code) return
    const shouldPoll = view !== "results" && (view !== "playing" || !gameState)
    if (!shouldPoll) return
    if (socketConnected) return // socket carries state updates; no need to poll
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
  }, [room?.room_code, view, gameState, socketConnected, resolveViewFromState, viewToLobbyAction])

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
    // Retour a l'ecran d'entree (nom pre-rempli) : on peut re-choisir creer/rejoindre et
    // n'importe quel mode. ENTRY_ROUTE[mode] renvoyait au meme mode -> on restait bloque dedans.
    router.replace("/")
  }, [room, userPayload, router, mode])

  const handleChangeMode = useCallback(() => {
    setGuest(false)
    handleLeaveRoom()
    router.push("/modes?from=/multiplayer")
  }, [handleLeaveRoom, router, setGuest])

  useEffect(() => {
    const hasCode = Boolean(initialJoinCode)
    if (!modeConfig || !mode) return
    if (roomRef.current || room || autojoin || flowStarted) return
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
  }, [modeConfig, mode, intent, room, autojoin, initialJoinCode, router, loading, flowStarted])

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
      const ret = typeof window !== "undefined" ? window.location.pathname + window.location.search : ""
      router.replace(`/auth/login?returnTo=${encodeURIComponent(ret)}`)
    }
  }, [loading, userPayload, router, storePostAuthRedirect, pendingAction, intent, initialJoinCode])

  if (loading || !userPayload) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        {rateLimited ? (
          <div className="max-w-sm space-y-3">
            <p className="font-display text-xl font-semibold text-[#2e2014]">Un instant…</p>
            <p className="text-sm text-[#6b573f]">Beaucoup de monde se connecte en même temps. On réessaie tout seul dans quelques secondes.</p>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#c65133]" />
          </div>
        ) : error ? (
          <div className="max-w-sm space-y-3">
            <p className="text-sm font-semibold text-[#9c2f1d]">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-2.5 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014]"
            >
              Réessayer
            </button>
          </div>
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-[#c65133]" />
        )}
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
      <div className="grid min-h-screen place-items-center px-6 text-[#6b573f]">
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#c65133]" />
          <p className="text-sm">Préparation du lobby…</p>
          <p className="text-xs text-[#8a7558]">Si l’attente dure, reviens au menu et relance.</p>
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
    initialProfileUrl,
    currentUserId,
    importing,
    onImportingChange: setImporting,
    chatMessages,
    onSendChat: room ? sendChat : undefined,
  }

  const streamerModeSelector =
    mode === "streamer" && view !== "playing" && view !== "results" ? (
      <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-4 text-[#2e2014] shadow-[4px_4px_0_rgba(46,32,20,.18)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#7d9471]">Gameplay</p>
        <h3 className="font-display text-lg font-semibold">Choisis le format</h3>
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
              className={`rounded-md border-2 px-3 py-3 text-left transition ${streamerMode === opt.value ? "border-[#2e2014] bg-[#7d9471] text-[#f4ecdb] shadow-[3px_3px_0_#2e2014]" : "border-[rgba(46,32,20,.35)] bg-[#efe5d0] text-[#2e2014] hover:border-[#2e2014]"}`}
            >
              <p className="text-sm font-bold">{opt.title}</p>
              <p className="text-xs opacity-80">{opt.desc}</p>
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
    <div className="fixed inset-0 z-30 grid place-items-center bg-[#2e2014]/40 px-6 text-center">
      <div className="max-w-md rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] p-8 shadow-[6px_6px_0_rgba(46,32,20,.25)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Spotify requis</p>
        <h3 className="mt-3 font-display text-2xl font-semibold text-[#2e2014]">Connecte ton Spotify</h3>
        <p className="mt-2 text-sm text-[#6b573f]">
          Les musiques sont tirées des comptes des joueurs. Connecte-toi pour rejoindre la salle{" "}
          <span className="font-display font-bold text-[#c65133]">{joinCode || "(code)"}</span>.
        </p>
        <p className="mt-2 text-xs text-[#8a7558]">Après connexion, tu entres directement dans la room.</p>
        <Button onClick={() => {
          handleSpotifyConnect()
          setRequireSpotify(false)
        }} className="mt-6 w-full justify-center rounded-md border-2 border-[#2e2014] bg-[#c65133] font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] backdrop-blur-none transition hover:translate-x-[2px] hover:translate-y-[2px] hover:border-[#2e2014] hover:bg-[#c65133] hover:shadow-[2px_2px_0_#2e2014]">
          Se connecter à Spotify
        </Button>
      </div>
    </div>
  ) : null

  // Guest mode no longer supported - all users must use Spotify
  const guestNotice = null

  const loadingGame =
    view === "playing" && room && !gameState ? (
      <div className="grid min-h-[50vh] place-items-center text-center text-sm text-[#6b573f]">
        <div className="space-y-3">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#c65133]" />
          <p>Synchronisation de la partie…</p>
          <p className="text-xs text-[#8a7558]">Si rien ne se passe, reste sur cette page quelques secondes.</p>
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
          answerRejectSignal={answerRejectSignal}
          onAnswer={(guessTitle, guessArtist, sourceUserId) => {
            const socket = socketRef.current
            if (!socket || !socket.connected) {
              showNotice("Connexion perdue, ta réponse n'est pas partie. Reconnexion…", true)
              ensureSocket()
              return
            }
            socket.emit("game:answer", { roomCode: room.room_code, guessTitle, guessArtist, sourceUserId })
          }}
          onReady={() => {
            const socket = socketRef.current
            if (!socket || !socket.connected) {
              showNotice("Connexion perdue. Reconnexion…")
              ensureSocket()
              return
            }
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
          onSendChat={sendChat}
        />
      )
    ) : view === "results" ? (
      <ResultsView
        leaderboard={leaderboard}
        tracks={tracks}
        currentUserId={currentUserId}
        accentColor={accentColor}
        isHost={isHost}
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
      isGuest={isGuest}
    >
      <div className="flex flex-col gap-4">
        {socketNotice ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-md border-2 border-[#9c2f1d] bg-[#efe5d0] px-4 py-3 text-sm font-semibold text-[#9c2f1d] shadow-[4px_4px_0_rgba(46,32,20,.18)]"
          >
            <span>{socketNotice}</span>
            <button type="button" onClick={() => setSocketNotice(null)} className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] underline">Fermer</button>
          </div>
        ) : null}
        {guestNotice}
        {content}
        {spotifyPrompt}
      </div>
    </LobbyShell>
  )
}
