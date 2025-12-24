"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Socket } from "socket.io-client"
import { getSocket, disconnectSocket } from "@/lib/socket"
import { api } from "@/lib/api"
import type { CurrentUserPayload } from "@/lib/api"
import type { FriendEntry, MultiplayerGameState, MultiplayerParticipant, MultiplayerRoom, SoloTrack } from "@/lib/types"
import { MultiplayerGameClient } from "@/components/game/MultiplayerGameClient"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, Copy, Heart, Loader2, PartyPopper, ShieldCheck, Share2, Sparkles, Users } from "lucide-react"
import { useServerTime } from "@/hooks/useServerTime"
import { useFriends } from "@/hooks/useFriends"
import { useInvitations } from "@/hooks/useInvitations"
import { ModeGate } from "@/components/system/ModeGate"
import { useMode } from "@/contexts/ModeContext"
import { GAME_MODES, resolveGameMode, type GameMode, type GameModeConfig } from "@/lib/gameModes"
import { modeDataAttrs } from "@/lib/uiTokens"

type View = "landing" | "hosting" | "waiting" | "playing" | "results"

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

export default function MultiplayerPageWrapper() {
  return (
    <ModeGate allowedModes={["friends", "event", "chat"]}>
      <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-[var(--ma-muted)]">Chargement…</div>}>
        <MultiplayerPage />
      </Suspense>
    </ModeGate>
  )
}

function MultiplayerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { mode, setMode, accentColor } = useMode()
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>("landing")

  const [room, setRoom] = useState<MultiplayerRoom | null>(null)
  const [participants, setParticipants] = useState<MultiplayerParticipant[]>([])
  const participantsRef = useRef<MultiplayerParticipant[]>([])

  const [tracks, setTracks] = useState<SoloTrack[]>([])
  const [gameState, setGameState] = useState<MultiplayerGameState | null>(null)
  const [starting, setStarting] = useState(false)
  const [joining, setJoining] = useState(false)

  const { friends, loading: friendsLoading, error: friendsError } = useFriends()
  const activeFriends = useMemo(
    () =>
      friends
        .filter(friend => friend.presence?.roomCode)
        .map(friend => ({
          userId: friend.userId,
          username: friend.username,
          roomCode: friend.presence?.roomCode ?? "",
          state: friend.presence?.status ?? "online",
          updatedAt: friend.presence?.updatedAt ?? Date.now(),
        })),
    [friends]
  )
  const { sendInvitation } = useInvitations()

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

  const [joinCode, setJoinCode] = useState("")
  const [resultsOpen, setResultsOpen] = useState(false)
  const serverNow = useServerTime(socketRef.current)
  const autoHostTriggered = useRef(false)
  const autoStartGameRef = useRef(false)
  const intent = searchParams.get("intent")
  const autojoin = searchParams.get("autojoin")
  const modeParam = resolveGameMode(searchParams.get("mode"))
  const effectiveMode: GameMode | null = modeParam ?? mode ?? null
  const modeConfig: GameModeConfig | null = effectiveMode ? GAME_MODES[effectiveMode] : null

  useEffect(() => {
    const codeParam = searchParams.get("code")
    if (codeParam) setJoinCode(codeParam.toUpperCase())
  }, [searchParams])

  useEffect(() => {
    if (modeParam && modeParam !== mode) {
      setMode(modeParam)
    }
  }, [modeParam, mode, setMode])

  useEffect(() => {
    if (!modeConfig) {
      router.replace("/modes")
    }
  }, [modeConfig, router])

  useEffect(() => {
    const hasCode = searchParams.get("code")
    if (!modeConfig || !effectiveMode) return
    if (roomRef.current || room || autojoin) return
    if (!intent && !hasCode) {
      router.replace(ENTRY_ROUTE[effectiveMode])
    }
  }, [modeConfig, effectiveMode, intent, room, autojoin, searchParams, router])

  useEffect(() => {
    let active = true
    async function bootstrap() {
      try {
        const me = await api.ensureUserSession("Invité")
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
    participantsRef.current = participants
  }, [participants])

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
        // Re-sync from API to avoid drift if a join event was missed earlier
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
        setResultsOpen(payload.status === "finished")
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
        setResultsOpen(true)
        setView("results")
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
          }
        } catch (err) {
          console.error("room_state_sync_failed", err)
        }
      })()
    },
    [ensureSocket, userPayload, refreshParticipants]
  )

  const handleCreateRoom = useCallback(async () => {
    try {
      setError(null)
      autoStartGameRef.current = false
      const { room: created } = await api.createRoom({ questionCount: 10 })
      setRoom(created)
      setGameState(null)
      setView("hosting")
      attachSocketListeners(created.room_code)
      const details = await api.roomDetails(created.room_code)
      setRoom(details.room)
      syncParticipants(details.participants)
    } catch (err) {
      console.error("create_room_failed", err)
      autoHostTriggered.current = false
      setError(
        err instanceof Error ? err.message : "Unable to create a room right now. Try again in a moment."
      )
    }
  }, [attachSocketListeners, syncParticipants])

  useEffect(() => {
    if (intent === "host" && !autoHostTriggered.current && view === "landing" && !room) {
      autoHostTriggered.current = true
      handleCreateRoom()
    }
  }, [intent, view, room, handleCreateRoom])

  useEffect(() => {
    if (!modeConfig?.lobby.autoStart) return
    if (autoHostTriggered.current) return
    if (view === "landing" && !room) {
      autoHostTriggered.current = true
      handleCreateRoom()
    }
  }, [modeConfig?.lobby.autoStart, view, room, handleCreateRoom])

  const joinRoomCode = useCallback(
    async (code: string) => {
      if (joining) return
      const normalizedCode = code.trim().toUpperCase()
      if (!normalizedCode) {
        setError("Enter a room code to join.")
        return
      }
      try {
        setJoining(true)
        setError(null)
        const { room: joined } = await api.joinRoom(normalizedCode)
        setRoom(joined)
        setGameState(null)
        setView("waiting")
        attachSocketListeners(joined.room_code)
        const details = await api.roomDetails(joined.room_code)
        setRoom(details.room)
        syncParticipants(details.participants)
      } catch (err) {
        console.error("join_room_failed", err)
        setError(err instanceof Error ? err.message : "Unable to join this room right now.")
      } finally {
        setJoining(false)
      }
    },
    [attachSocketListeners, joining, syncParticipants]
  )

  const handleJoinRoom = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      joinRoomCode(joinCode)
    },
    [joinCode, joinRoomCode]
  )

  const handleStartGame = useCallback(async () => {
    if (!room) return
    try {
      setStarting(true)
      setError(null)
      const payload: { source?: string; playlistId?: string } = {
        source: "library",
      }
      const { tracks: generatedTracks, gameState: initialState } = await api.startMultiplayerGame(
        room.room_code,
        payload
      )
      setTracks(generatedTracks)
      if (initialState) {
        setGameState(initialState)
      } else {
        // Safety: resynchronise with server snapshot if the initial payload is missing
        try {
          const latest = await api.roomState(room.room_code)
          if (latest.tracks?.length) setTracks(latest.tracks)
          if (latest.gameState) setGameState(latest.gameState)
        } catch (err) {
          console.error("start_game_resync_failed", err)
        }
      }
      setView("playing")
      setResultsOpen(false)
    } catch (err) {
      console.error("start_multiplayer_failed", err)
      setError(
        err instanceof Error ? err.message : "Unable to start the game. Check your library and try again."
      )
    } finally {
      setStarting(false)
    }
  }, [room])

  useEffect(() => {
    if (!modeConfig?.lobby.autoStart) return
    if (!room) return
    if (view !== "hosting" && view !== "waiting") return
    if (starting) return
    const enoughPlayers = participants.length >= modeConfig.lobby.minPlayers
    if (enoughPlayers && !autoStartGameRef.current) {
      autoStartGameRef.current = true
      handleStartGame()
    }
  }, [modeConfig, room, view, participants.length, starting, handleStartGame])

  const handleInviteFriendToRoom = useCallback(
    async (userId: number) => {
      if (!room?.room_code) return
      try {
        await sendInvitation(userId, room.room_code)
      } catch (err) {
        console.error("send_room_invite_failed", err)
        setError(err instanceof Error ? err.message : "Unable to send this invitation.")
      }
    },
    [room, sendInvitation]
  )

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
  }, [room, userPayload])

  const handleExit = useCallback(() => {
    handleLeaveRoom()
    router.replace("/menu")
  }, [handleLeaveRoom, router])

  const dataAttrs = modeDataAttrs(effectiveMode)

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

  return (
    <main className="min-h-screen bg-black text-white" {...dataAttrs}>
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        {view !== "results" && <Header onLeave={handleLeaveRoom} mode={effectiveMode} />}

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {view === "landing" && (
          <LandingView
            onHost={handleCreateRoom}
            onJoinSubmit={handleJoinRoom}
            joinCode={joinCode}
            setJoinCode={setJoinCode}
            joining={joining}
            mode={effectiveMode}
            modeConfig={modeConfig}
          />
        )}

        {view === "hosting" && room && modeConfig && effectiveMode && (
          <HostLobby
            room={room}
            participants={participants}
            onStart={handleStartGame}
            starting={starting}
            scores={scores}
            friends={friends}
            friendsLoading={friendsLoading}
            friendsError={friendsError}
            activeFriends={activeFriends}
            onQuickJoin={joinRoomCode}
            onInviteFriend={handleInviteFriendToRoom}
            modeConfig={modeConfig}
            mode={effectiveMode as GameMode}
          />
        )}

        {view === "waiting" && room && modeConfig && effectiveMode && (
          <WaitingLobby
            room={room}
            participants={participants}
            scores={scores}
            activeFriends={activeFriends}
            onQuickJoin={joinRoomCode}
            modeConfig={modeConfig}
            mode={effectiveMode as GameMode}
          />
        )}

        {view === "playing" && gameState && room && modeConfig && (
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
            modeConfig={modeConfig}
            accentColor={accentColor}
          />
        )}

        {view === "results" && (
          <ResultsView
            leaderboard={leaderboard}
            tracks={tracks}
            currentUserId={userPayload.user.id}
            onReturn={() => router.replace("/menu")}
            onReplay={() => {
              autoStartGameRef.current = false
              autoHostTriggered.current = false
              setView("landing")
              setRoom(null)
              setParticipants([])
              setResultsOpen(false)
              setTracks([])
              setGameState(null)
            }}
          />
        )}
      </div>
    </main>
  )
}

const HEADER_COPY: Record<GameMode, { title: string; subtitle: string }> = {
  friends: {
    title: "Amis",
    subtitle: "Invite ou crée ta salle privée. Musique depuis vos bibliothèques.",
  },
  event: {
    title: "Événement",
    subtitle: "Projection lisible, rythme piloté. Musique depuis les bibliothèques des joueurs.",
  },
  chat: {
    title: "Chat",
    subtitle: "Le salon tourne, le chat répond. Musique depuis vos bibliothèques.",
  },
}

const HOST_ICON: Record<GameMode, JSX.Element> = {
  friends: <Sparkles className="h-4 w-4" />,
  event: <ShieldCheck className="h-4 w-4" />,
  chat: <PartyPopper className="h-4 w-4" />,
}

const HOST_START_LABEL: Record<GameMode, string> = {
  friends: "Lancer la partie",
  event: "Démarrer l’événement",
  chat: "Lancer le salon",
}

const WAITING_TITLE: Record<GameMode, { title: string; subtitle: string }> = {
  friends: { title: "En attente du lancement", subtitle: "Le host démarre dès que tout le monde est prêt." },
  event: { title: "Projection en place", subtitle: "L’écran principal va lancer la musique." },
  chat: { title: "Salon en cours", subtitle: "La partie démarre sans code ni lobby." },
}

const ENTRY_ROUTE: Record<GameMode, string> = {
  friends: "/friends",
  event: "/event",
  chat: "/chat",
}

function Header({ onLeave, mode }: { onLeave: () => void; mode: GameMode | null }) {
  const header = mode ? HEADER_COPY[mode] : { title: "Blindify Rooms", subtitle: "Crée une salle ou rejoins tes amis pour des blind tests synchronisés." }
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Multijoueur</p>
            <h1 className="text-3xl font-bold text-white">{header.title}</h1>
            <p className="text-sm text-[var(--ma-muted)]">{header.subtitle}</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onLeave}
          className="gap-2 rounded-full border border-[var(--ma-border)] bg-transparent text-white hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Quitter
        </Button>
      </div>
    </div>
  )
}

const LANDING_COPY: Record<
  GameMode,
  { hostTitle: string; hostSubtitle: string; hostCta: string; joinTitle?: string; joinSubtitle?: string }
> = {
  friends: {
    hostTitle: "Créer une salle",
    hostSubtitle: "Invite tes amis, musique depuis vos bibliothèques.",
    hostCta: "Créer une salle",
    joinTitle: "Rejoindre une salle",
    joinSubtitle: "Un code si besoin, sinon invitation.",
  },
  event: {
    hostTitle: "Préparer l’événement",
    hostSubtitle: "Un seul écran, musique depuis vos bibliothèques.",
    hostCta: "Démarrer",
  },
  chat: {
    hostTitle: "Ouvrir le salon",
    hostSubtitle: "Le chat rejoint dès que la musique tourne.",
    hostCta: "Ouvrir le salon",
  },
}

function LandingView({
  onHost,
  onJoinSubmit,
  joinCode,
  setJoinCode,
  joining,
  mode,
  modeConfig,
}: {
  onHost: () => void
  onJoinSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  joinCode: string
  setJoinCode: (value: string) => void
  joining: boolean
  mode: GameMode | null
  modeConfig: GameModeConfig | null
}) {
  const handlePasteJoinCode = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setJoinCode(text.trim().toUpperCase())
      }
    } catch (err) {
      console.error("paste_join_code_failed", err)
    }
  }, [setJoinCode])

  if (!mode || !modeConfig) return null

  const copy = LANDING_COPY[mode]
  const showJoin = modeConfig.lobby.showRoomCode
  const allowInvites = modeConfig.lobby.allowInvites
  const gridClass = showJoin ? "grid gap-6 md:grid-cols-2" : "grid gap-6"

  return (
    <section className={gridClass}>
      <div className="flex flex-col gap-5 rounded-2xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-8">
        <h2 className="text-2xl font-semibold text-white">{copy.hostTitle}</h2>
        <p className="text-sm text-[var(--ma-muted)]">{copy.hostSubtitle}</p>
        {allowInvites ? (
          <p className="text-xs text-[var(--ma-muted)]">Invitations directes depuis ta liste d&apos;amis.</p>
        ) : null}
        <Button onClick={onHost} className="ma-btn-primary mt-auto gap-2 self-start rounded-lg px-5 py-3 text-sm">
          {HOST_ICON[mode]}
          {copy.hostCta}
        </Button>
        {modeConfig.lobby.autoStart ? (
          <p className="text-xs text-[var(--ma-muted)]">
            Démarrage automatique dès {modeConfig.lobby.minPlayers} joueur(s) prêt(s).
          </p>
        ) : null}
      </div>

      {showJoin ? (
        <form
          onSubmit={onJoinSubmit}
          className="flex flex-col gap-5 rounded-2xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-8"
        >
          <h2 className="text-2xl font-semibold text-white">{copy.joinTitle}</h2>
          <p className="text-sm text-[var(--ma-muted)]">{copy.joinSubtitle}</p>
          <div className="flex items-center gap-3">
            <input
              value={joinCode}
              onChange={event => setJoinCode(event.target.value.toUpperCase())}
              placeholder="Room code"
              className="w-full rounded-lg border border-[var(--ma-border)] bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-[rgba(168,85,247,0.5)]"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handlePasteJoinCode}
              className="shrink-0 rounded-lg border border-[var(--ma-border)] bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-white transition hover:border-[rgba(168,85,247,0.6)]"
            >
              Paste
            </Button>
          </div>
          <Button type="submit" className="gap-2 self-start rounded-lg px-5 py-3 text-sm" disabled={joining}>
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Rejoindre
          </Button>
        </form>
      ) : null}
    </section>
  )
}

function HostLobby({
  room,
  participants,
  onStart,
  starting,
  scores,
  friends,
  friendsLoading,
  friendsError,
  activeFriends,
  onQuickJoin,
  onInviteFriend,
  modeConfig,
  mode,
}: {
  room: MultiplayerRoom
  participants: MultiplayerParticipant[]
  onStart: () => void
  starting: boolean
  scores: Record<number, { username: string | null; score: number; accuracy: number }>
  friends: FriendEntry[]
  friendsLoading: boolean
  friendsError: string | null
  activeFriends: Array<{ userId: number; username: string | null; roomCode: string; state: string; updatedAt: number }>
  onQuickJoin: (code: string) => void
  onInviteFriend: (userId: number) => Promise<void> | void
  modeConfig: GameModeConfig
  mode: GameMode
}) {
  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(room.room_code).catch(() => undefined)
  }, [room.room_code])

  const [inviteBusy, setInviteBusy] = useState<number | null>(null)
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)
  const { lobby } = modeConfig
  const showRoomCode = lobby.showRoomCode
  const showFriendsList = lobby.showFriendsList
  const allowInvites = lobby.allowInvites
  const minPlayers = lobby.minPlayers
  const startLabel = HOST_START_LABEL[mode]
  const handleInvite = useCallback(
    async (userId: number) => {
      setInviteBusy(userId)
      try {
        await onInviteFriend(userId)
        setInviteNotice("Invitation envoyée à ton ami.")
      } catch (err) {
        console.error("direct_invite_failed", err)
      } finally {
        setInviteBusy(null)
      }
    },
    [onInviteFriend]
  )

  return (
    <section className="grid gap-6 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
      <div className="surface flex flex-col gap-5 rounded-3xl border border-white/10 p-8">
        {showRoomCode ? (
          <>
            <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Room code</p>
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="font-mono text-xl tracking-[0.3em] text-white">{room.room_code}</span>
              <Button variant="outline" onClick={copyCode} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>
            <p className="text-sm text-slate-300">
              Invite tes amis déjà ajoutés : un clic envoie une invitation via le système d&apos;amis (pas de lien à copier).
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-300">Pas de code : démarrage direct, tout le monde suit le rythme.</p>
        )}

        {showFriendsList || allowInvites ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.35em] text-slate-400">Amis</span>
              <span className="text-xs text-slate-400">
                {friendsLoading ? "Chargement..." : `${friends.filter(f => f.status === "accepted").length} prêts`}
              </span>
            </div>
            {friendsError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{friendsError}</div>
            ) : null}
            <div className="space-y-2">
              {friends
                .filter(friend => friend.status === "accepted")
                .map(friend => (
                  <div
                    key={friend.userId}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  >
                    <div className="flex flex-col">
                      <span className="truncate font-semibold">{friend.username || `Ami ${friend.userId}`}</span>
                      <span className="text-[11px] text-slate-400">
                        {friend.presence?.status === "playing"
                          ? `En room ${friend.presence.roomCode ?? ""}`
                          : friend.presence?.status === "online"
                            ? "En ligne"
                            : "Hors ligne"}
                      </span>
                    </div>
                    {allowInvites ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInvite(friend.userId)}
                        className="shrink-0 gap-1"
                        disabled={inviteBusy === friend.userId}
                        aria-label={`Inviter ${friend.username || "ami"}`}
                      >
                        {inviteBusy === friend.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                        Inviter
                      </Button>
                    ) : null}
                  </div>
                ))}
              {!friendsLoading && friends.filter(f => f.status === "accepted").length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-400">
                  Aucun ami accepté pour l'instant. Ajoute-les depuis le menu puis reviens lancer la salle.
                </div>
              ) : null}
            </div>
            {inviteNotice ? (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                {inviteNotice}
              </div>
            ) : null}
          </div>
        ) : null}

        <Button onClick={onStart} disabled={starting || participants.length < minPlayers} className="mt-auto gap-2">
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {participants.length < minPlayers ? `Minimum ${minPlayers} joueur(s)` : startLabel}
        </Button>
      </div>
      <ParticipantPanel participants={participants} scores={scores} title="Joueurs" modeConfig={modeConfig} />

      {activeFriends.length > 0 && showFriendsList ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 text-left">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">Amis en salle</h3>
            <span className="text-xs text-slate-400">Clique pour les rejoindre</span>
          </div>
          <div className="mt-3 grid gap-3">
            {activeFriends.map(friend => (
              <div
                key={`${friend.userId}-${friend.roomCode}`}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <div className="flex flex-col">
                  <span className="font-semibold">{friend.username || `Ami ${friend.userId}`}</span>
                  <span className="text-xs text-slate-400">Room {friend.roomCode}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => onQuickJoin(friend.roomCode)} className="shrink-0 gap-1">
                  <Users className="h-4 w-4" />
                  Rejoindre
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function WaitingLobby({
  room,
  participants,
  scores,
  activeFriends,
  onQuickJoin,
  modeConfig,
  mode,
}: {
  room: MultiplayerRoom
  participants: MultiplayerParticipant[]
  scores: Record<number, { username: string | null; score: number; accuracy: number }>
  activeFriends: Array<{ userId: number; username: string | null; roomCode: string; state: string; updatedAt: number }>
  onQuickJoin: (code: string) => void
  modeConfig: GameModeConfig
  mode: GameMode
}) {
  const inviteLink =
    typeof window !== "undefined" ? `${window.location.origin}/blindify/multiplayer/?code=${room.room_code}` : ""
  const showRoomCode = modeConfig.lobby.showRoomCode
  const showFriendsList = modeConfig.lobby.showFriendsList

  return (
    <section className="surface flex flex-col gap-6 rounded-3xl border border-white/10 p-8 text-center">
      <p className="text-xs uppercase tracking-[0.5em] text-slate-400">En attente</p>
      <h2 className="text-2xl font-semibold text-white">{WAITING_TITLE[mode].title}</h2>
      <p className="text-sm text-slate-300">{WAITING_TITLE[mode].subtitle}</p>

      {showRoomCode ? (
        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Invite tes amis</div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white">
            <span className="truncate">{inviteLink || "Lien disponible en ligne"}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.share
                ? navigator
                    .share({ title: "Blindify", text: "Rejoins ma salle", url: inviteLink })
                    .catch(() => navigator.clipboard.writeText(inviteLink))
                : navigator.clipboard.writeText(inviteLink)
              }
              className="shrink-0 gap-1"
            >
              <Share2 className="h-4 w-4" />
              Envoyer
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-sm text-slate-200">
          Aucun code requis. La partie démarre dès que tout le monde est prêt.
        </div>
      )}

      <ParticipantPanel participants={participants} scores={scores} title="Players in room" compact modeConfig={modeConfig} />
      <p className="text-xs text-slate-500">
        {showRoomCode ? `Room ${room.room_code} · ` : null}
        {participants.length} joueur(s)
      </p>

      {activeFriends.length > 0 && showFriendsList ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-left">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-2">Tes amis en partie</div>
          <div className="grid gap-2">
            {activeFriends.map(friend => (
              <div key={`${friend.userId}-${friend.roomCode}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
                <span>{friend.username || `Ami ${friend.userId}`}</span>
                <Button size="sm" variant="outline" onClick={() => onQuickJoin(friend.roomCode)} className="shrink-0 gap-1">
                  <Users className="h-4 w-4" />
                  Rejoindre
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ParticipantPanel({
  participants,
  scores,
  title,
  compact,
  modeConfig,
}: {
  participants: MultiplayerParticipant[]
  scores: Record<number, { username: string | null; score: number; accuracy: number }>
  title: string
  compact?: boolean
  modeConfig: GameModeConfig
}) {
  const showScores = modeConfig.game.scoring !== false
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-black/60 ${compact ? "p-6" : "p-8"} text-left backdrop-blur`}
    >
      <h3 className="text-sm font-semibold uppercase tracking-[0.4em] text-slate-400">{title}</h3>
      <ul className="mt-4 space-y-3 text-sm text-slate-200">
        {participants.map(participant => (
          <li
            key={participant.user_id}
            className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
          >
            <span>{participant.username || `Player #${participant.user_id}`}</span>
            {showScores ? (
              <span className="text-xs uppercase tracking-[0.4em] text-slate-400">
                {scores[participant.user_id]?.score ?? 0} pts · {scores[participant.user_id]?.accuracy ?? 0}%
              </span>
            ) : (
              <span className="text-xs uppercase tracking-[0.4em] text-slate-400">Présent</span>
            )}
          </li>
        ))}
        {participants.length === 0 && (
          <li className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.4em] text-slate-400">
            Waiting for players…
          </li>
        )}
      </ul>
    </div>
  )
}

function ResultsView({
  leaderboard,
  tracks,
  currentUserId,
  onReturn,
  onReplay,
}: {
  leaderboard: Array<{ userId: number; username: string | null; score: number; accuracy: number; avatar?: string | null }>
  tracks: SoloTrack[]
  currentUserId?: number | null
  onReturn: () => void
  onReplay: () => void
}) {
  const [liking, setLiking] = useState<Record<string, boolean>>({})
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())

  const podium = leaderboard.slice(0, 3)
  const podiumOrdered = [podium[1], podium[0], podium[2]].filter(Boolean)
  const rest = leaderboard.slice(3)

  const contributorById = useMemo(() => {
    const map = new Map<number, string>()
    leaderboard.forEach(entry => {
      const displayName = entry.username?.trim() || `Joueur ${entry.userId}`
      map.set(entry.userId, displayName)
    })
    return map
  }, [leaderboard])

  const resolveContributor = useCallback(
    (track: SoloTrack) => {
      const meta = (track.metadata ?? {}) as Record<string, unknown>
      const ownerUsername = (meta.owner_username as string | undefined)?.trim()
      const ownerIdRaw = (meta.owner_user_id as number | string | undefined) ?? (meta.user_id as number | string | undefined)
      const ownerId = typeof ownerIdRaw === "string" ? Number(ownerIdRaw) : ownerIdRaw
      if (ownerUsername) return ownerUsername
      if (ownerId) return contributorById.get(ownerId) ?? `Joueur ${ownerId}`
      return null
    },
    [contributorById]
  )

  const initials = (name: string | null | undefined, id: number) => {
    const safe = name?.trim();
    if (safe) {
      const parts = safe.split(" ").filter(Boolean);
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return safe.slice(0, 2).toUpperCase();
    }
    return `#${id}`.slice(0, 2);
  };

  const handleLike = async (track: SoloTrack) => {
    const id = track.audioSourceId ?? track.track_id
    if (!id || liking[id]) return
    setLiking(prev => ({ ...prev, [id]: true }))
    try {
      await api.addLike(currentUserId, track.audioSourceId ?? track.track_id)
      setLikedIds(prev => new Set(prev).add(id))
    } catch (err) {
      console.error("like_track_failed", err)
    } finally {
      setLiking(prev => ({ ...prev, [id]: false }))
    }
  }

  return (
    <section className="surface flex flex-col gap-5 rounded-3xl border border-white/10 bg-black/60 p-7 text-center shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <PartyPopper className="h-5 w-5 text-neon" />
          <span>Bravo ! Voici le podium</span>
        </div>
        <h2 className="text-2xl font-semibold text-white">Résumé de la manche</h2>
      </div>

      <div className="flex flex-col items-center">
        <div className="grid w-full max-w-4xl grid-cols-1 items-end gap-4 md:grid-cols-3 md:gap-6">
          {podiumOrdered.map((entry, idx) => {
            const rank = idx === 1 ? 1 : idx === 0 ? 2 : 3;
            const height = rank === 1 ? "h-56" : rank === 2 ? "h-44" : "h-40";
            const gradient =
              rank === 1
                ? "from-amber-400 via-yellow-300 to-orange-400"
                : rank === 2
                  ? "from-slate-200 via-blue-200 to-indigo-400"
                  : "from-amber-700 via-amber-600 to-amber-500";
            const colOrder = rank === 1 ? "md:col-start-2" : rank === 2 ? "md:col-start-1" : "md:col-start-3";
            return (
              <div key={entry.userId} className={`flex flex-col items-center gap-3 ${colOrder}`}>
                <div
                  className={`relative flex items-center justify-center overflow-hidden rounded-full border-4 border-white/20 bg-white text-xl font-bold text-black shadow-[0_15px_35px_rgba(0,0,0,0.35)] ${rank === 1 ? "h-24 w-24" : "h-20 w-20"}`}
                >
                  {rank === 1 && <span className="absolute -top-5 text-2xl">👑</span>}
                  {entry.avatar ? (
                    <img src={entry.avatar} alt={entry.username ?? `Joueur ${entry.userId}`} className="h-full w-full object-cover" />
                  ) : (
                    <span>{initials(entry.username, entry.userId)}</span>
                  )}
                </div>
                <div
                  className={`flex w-48 flex-col items-center justify-end rounded-3xl border border-white/10 bg-gradient-to-b ${gradient} px-4 pb-4 pt-6 text-black shadow-[0_25px_70px_rgba(0,0,0,0.35)] ${height}`}
                >
                  <div className="text-4xl font-black drop-shadow-sm text-black/80">{rank}</div>
                  <div className="mt-1 text-base font-semibold text-black">{entry.username || `Joueur ${entry.userId}`}</div>
                  <div className="text-sm font-semibold text-black/80">{entry.score} pts • {entry.accuracy}%</div>
                </div>
              </div>
            );
          })}
        </div>
        {podium.length === 0 && <div className="text-sm text-slate-400">Aucun score.</div>}
      </div>

      {rest.length ? (
        <div className="rounded-3xl border border-white/10 bg-white/5">
          <table className="w-full text-left text-sm text-slate-200">
            <thead className="text-xs uppercase tracking-[0.4em] text-slate-400">
              <tr>
                <th className="px-6 py-3">Rank</th>
                <th className="px-6 py-3">Player</th>
                <th className="px-6 py-3 text-right">Score</th>
                <th className="px-6 py-3 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((entry, index) => (
                <tr key={entry.userId} className="border-t border-white/5">
                  <td className="px-6 py-3">{index + 4}</td>
                  <td className="px-6 py-3">{entry.username || `Player #${entry.userId}`}</td>
                  <td className="px-6 py-3 text-right font-semibold">{entry.score}</td>
                  <td className="px-6 py-3 text-right">{entry.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Titres joués</h3>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Joueur source affiché et ajout aux likes</p>
          </div>
          <span className="text-xs uppercase tracking-[0.35em] text-slate-400">{tracks.length} titres</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {tracks.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun titre disponible.</p>
          ) : (
            tracks.map((track, idx) => {
              const owner = resolveContributor(track)
              const id = track.audioSourceId ?? track.track_id
              const isLiking = liking[id ?? ""] || false
              const isLiked = likedIds.has(id ?? "")
              return (
                <div
                  key={`${id}-${idx}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex flex-col gap-1">
                    <div className="font-semibold text-white">{track.title}</div>
                    <div className="text-xs text-slate-400">{track.artist}</div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-[2px] uppercase tracking-[0.2em] text-[10px] text-slate-300">
                        Joueur
                      </span>
                      <span className="text-slate-200">{owner ?? "Inconnu"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      disabled={!id || isLiking}
                      onClick={() => handleLike(track)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/10 transition hover:border-rose-400/60 hover:text-rose-300 ${isLiked ? "bg-rose-500/20 text-rose-200" : "bg-white/5 text-white"}`}
                      title="Ajouter aux likes"
                    >
                      <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                    </button>
                    <span className="text-xs text-slate-400">#{idx + 1}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <Button variant="outline" onClick={onReturn} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to menu
        </Button>
        <Button onClick={onReplay} className="gap-2">
          <ShieldCheck className="h-4 w-4" />
          New lobby
        </Button>
      </div>
    </section>
  )
}
