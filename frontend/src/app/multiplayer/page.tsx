"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Socket } from "socket.io-client"
import { getSocket, disconnectSocket } from "@/lib/socket"
import { api } from "@/lib/api"
import type { CurrentUserPayload } from "@/lib/api"
import type { MultiplayerGameState, MultiplayerParticipant, MultiplayerRoom, SoloTrack } from "@/lib/types"
import { MultiplayerGameClient } from "@/components/game/MultiplayerGameClient"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, Copy, Heart, Loader2, PartyPopper, ShieldCheck, Sparkles, Users } from "lucide-react"
import { useServerTime } from "@/hooks/useServerTime"

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
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-[var(--ma-muted)]">Chargement…</div>}>
      <MultiplayerPage />
    </Suspense>
  )
}

function MultiplayerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const [autoAdvance, setAutoAdvance] = useState(false)

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

  useEffect(() => {
    const codeParam = searchParams.get("code")
    if (codeParam) setJoinCode(codeParam.toUpperCase())
  }, [searchParams])

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
        setAutoAdvance(Boolean(details.room.auto_advance))
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
            setAutoAdvance(Boolean(updated.room.auto_advance))
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
    [ensureSocket, userPayload, autoAdvance, refreshParticipants]
  )

  const handleCreateRoom = useCallback(async () => {
    try {
      setError(null)
      const { room: created } = await api.createRoom({ autoAdvance, questionCount: 10 })
      setRoom(created)
      setGameState(null)
      setView("hosting")
      attachSocketListeners(created.room_code)
      const details = await api.roomDetails(created.room_code)
      setRoom(details.room)
      setAutoAdvance(Boolean(details.room.auto_advance))
      syncParticipants(details.participants)
    } catch (err) {
      console.error("create_room_failed", err)
      setError(
        err instanceof Error ? err.message : "Unable to create a room right now. Try again in a moment."
      )
    }
  }, [attachSocketListeners, syncParticipants])

  const handleJoinRoom = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (joining) return
      const normalizedCode = joinCode.trim().toUpperCase()
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
        setAutoAdvance(Boolean(joined.auto_advance))
        setView("waiting")
        attachSocketListeners(joined.room_code)
        const details = await api.roomDetails(joined.room_code)
        setRoom(details.room)
        setAutoAdvance(Boolean(details.room.auto_advance))
        syncParticipants(details.participants)
      } catch (err) {
        console.error("join_room_failed", err)
        setError(err instanceof Error ? err.message : "Unable to join this room right now.")
      } finally {
        setJoining(false)
      }
    },
    [attachSocketListeners, joinCode, joining, syncParticipants]
  )

  const handleStartGame = useCallback(async () => {
    if (!room) return
    try {
      setStarting(true)
      setError(null)
      const payload: { source?: string; playlistId?: string; autoAdvance?: boolean } = {
        source: "library",
        autoAdvance,
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
  }, [room, autoAdvance])

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
    <main className="min-h-screen bg-black text-white">
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        {view !== "results" && <Header onLeave={handleLeaveRoom} view={view} />}

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
          />
        )}

        {view === "hosting" && room && (
          <HostLobby
            room={room}
            participants={participants}
            onStart={handleStartGame}
            starting={starting}
            scores={scores}
            autoAdvance={autoAdvance}
            setAutoAdvance={setAutoAdvance}
          />
        )}

        {view === "waiting" && room && (
          <WaitingLobby
            room={room}
            participants={participants}
            scores={scores}
          />
        )}

        {view === "playing" && gameState && room && (
          <MultiplayerGameClient
            user={userPayload.user}
            state={gameState}
            serverNow={serverNow}
            autoAdvance={autoAdvance}
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
          />
        )}

        {view === "results" && (
          <ResultsView
            leaderboard={leaderboard}
            tracks={tracks}
            currentUserId={userPayload.user.id}
            onReturn={() => router.replace("/menu")}
            onReplay={() => {
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

function Header({ onLeave, view }: { onLeave: () => void; view: View }) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ma-muted)]">Multijoueur</p>
            <h1 className="text-3xl font-bold text-white">Blindify Rooms</h1>
            <p className="text-sm text-[var(--ma-muted)]">
              {view === "landing"
                ? "Crée une salle ou rejoins tes amis pour des blind tests synchronisés."
                : "Reste synchro avec tes amis et suis le score en direct."}
            </p>
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

function LandingView({
  onHost,
  onJoinSubmit,
  joinCode,
  setJoinCode,
  joining,
}: {
  onHost: () => void
  onJoinSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  joinCode: string
  setJoinCode: (value: string) => void
  joining: boolean
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

  return (
    <section className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-5 rounded-2xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-8">
        <h2 className="text-2xl font-semibold text-white">Créer une salle</h2>
        <p className="text-sm text-[var(--ma-muted)]">
          Génère un code, partage-le, choisis une source (likés, top semaine/mois, playlist) et lance les manches.
        </p>
        <Button onClick={onHost} className="ma-btn-primary mt-auto gap-2 self-start rounded-lg px-5 py-3 text-sm">
          <Sparkles className="h-4 w-4" />
          Créer une salle
        </Button>
      </div>
      <form
        onSubmit={onJoinSubmit}
        className="flex flex-col gap-5 rounded-2xl border border-[var(--ma-border)] bg-[var(--ma-surface)] p-8"
      >
        <h2 className="text-2xl font-semibold text-white">Rejoindre une salle</h2>
        <p className="text-sm text-[var(--ma-muted)]">
          Entre le code à 6 caractères pour rejoindre le lobby en cours.
        </p>
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
    </section>
  )
}

function HostLobby({
  room,
  participants,
  onStart,
  starting,
  scores,
  autoAdvance,
  setAutoAdvance,
}: {
  room: MultiplayerRoom
  participants: MultiplayerParticipant[]
  onStart: () => void
  starting: boolean
  scores: Record<number, { username: string | null; score: number; accuracy: number }>
  autoAdvance: boolean
  setAutoAdvance: (value: boolean) => void
}) {
  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(room.room_code).catch(() => undefined)
  }, [room.room_code])

  return (
    <section className="grid gap-6 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
      <div className="surface flex flex-col gap-5 rounded-3xl border border-white/10 p-8">
        <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Room code</p>
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <span className="font-mono text-xl tracking-[0.3em] text-white">{room.room_code}</span>
          <Button variant="outline" onClick={copyCode} className="gap-2">
            <Copy className="h-4 w-4" />
            Copy
          </Button>
        </div>
        <p className="text-sm text-slate-300">
          Share this code with friends. Choisissez la source puis démarrez le blind test.
        </p>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Source</div>
          <div className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white">
            Source fixée : Bibliothèque (aléatoire)
          </div>
          <p className="text-xs text-slate-400">Le choix de source sera disponible plus tard dans les paramètres.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Avancement</p>
              <p className="text-sm text-slate-300">Auto-enchainement des manches</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={event => setAutoAdvance(event.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-black/50 text-neon focus:ring-2 focus:ring-neon/40"
              />
              Auto-advance
            </label>
          </div>
        </div>

        <Button onClick={onStart} disabled={starting || participants.length < 2} className="mt-auto gap-2">
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {participants.length < 2 ? "Need at least 2 players" : "Start the game"}
        </Button>
      </div>
      <ParticipantPanel participants={participants} scores={scores} title="Lobby players" />
    </section>
  )
}

function WaitingLobby({
  room,
  participants,
  scores,
}: {
  room: MultiplayerRoom
  participants: MultiplayerParticipant[]
  scores: Record<number, { username: string | null; score: number; accuracy: number }>
}) {
  return (
    <section className="surface flex flex-col gap-6 rounded-3xl border border-white/10 p-8 text-center">
      <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Waiting for host</p>
      <h2 className="text-2xl font-semibold text-white">Stay tuned</h2>
      <p className="text-sm text-slate-300">
        Once the host starts the game, a synchronized blind test will begin automatically. Keep Spotify open and ready.
      </p>
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Source</div>
        <div className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white">
          Source fixée : Bibliothèque (aléatoire)
        </div>
      </div>
      <ParticipantPanel participants={participants} scores={scores} title="Players in room" compact />
      <p className="text-xs text-slate-500">Room {room.room_code} · {participants.length} player(s)</p>
    </section>
  )
}

function ParticipantPanel({
  participants,
  scores,
  title,
  compact,
}: {
  participants: MultiplayerParticipant[]
  scores: Record<number, { username: string | null; score: number; accuracy: number }>
  title: string
  compact?: boolean
}) {
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
            <span className="text-xs uppercase tracking-[0.4em] text-slate-400">
              {scores[participant.user_id]?.score ?? 0} pts · {scores[participant.user_id]?.accuracy ?? 0}%
            </span>
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
