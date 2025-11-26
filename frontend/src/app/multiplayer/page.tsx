"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Socket } from "socket.io-client"
import { getSocket, disconnectSocket } from "@/lib/socket"
import { api } from "@/lib/api"
import type { CurrentUserPayload } from "@/lib/api"
import type { MultiplayerParticipant, MultiplayerRoom, SoloTrack } from "@/lib/types"
import { SoloGameClient, type RoundStats } from "@/components/game/SoloGameClient"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, Copy, Loader2, PartyPopper, ShieldCheck, Sparkles, Users } from "lucide-react"

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

type MultiplayerStartPayload = {
  session: {
    id: number
    mode: string
    difficulty: string
    provider: string
    totalRounds: number
    startedAt: string
    roomCode: string
  }
  tracks: SoloTrack[]
  host: {
    id: number
    username: string | null
  }
}

type ScoreUpdatePayload = {
  roomCode: string
  userId: number
  score: number
  accuracy: number
}

export default function MultiplayerPage() {
  const router = useRouter()
  const [userPayload, setUserPayload] = useState<CurrentUserPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>("landing")

  const [room, setRoom] = useState<MultiplayerRoom | null>(null)
  const [participants, setParticipants] = useState<MultiplayerParticipant[]>([])
  const participantsRef = useRef<MultiplayerParticipant[]>([])

  const [tracks, setTracks] = useState<SoloTrack[]>([])
  const [session, setSession] = useState<MultiplayerStartPayload["session"] | null>(null)
  const [starting, setStarting] = useState(false)
  const [joining, setJoining] = useState(false)

  const [scores, setScores] = useState<Record<number, { username: string | null; score: number; accuracy: number }>>(
    {}
  )
  const [finalStats, setFinalStats] = useState<Record<number, { username: string | null; score: number; accuracy: number }>>({})

  const socketRef = useRef<Socket | null>(null)
  const handlersRef = useRef<{
    presence?: (payload: RoomPresenceEvent) => void
    start?: (payload: MultiplayerStartPayload) => void
    score?: (payload: ScoreUpdatePayload) => void
  }>({})

  const [joinCode, setJoinCode] = useState("")
  const [resultsOpen, setResultsOpen] = useState(false)

  useEffect(() => {
    let active = true
    async function bootstrap() {
      try {
        const me = await api.checkAuth()
        if (!active) return
        if (!me) {
          router.replace("/auth/login")
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
      if (room && userPayload) {
        const socket = socketRef.current
        socket?.emit("room:leave", { roomCode: room.room_code, userId: userPayload.user.id })
      }
      const socket = socketRef.current
      if (socket && handlersRef.current) {
        if (handlersRef.current.presence) socket.off("room:presence", handlersRef.current.presence)
        if (handlersRef.current.start) socket.off("multiplayer:start", handlersRef.current.start)
        if (handlersRef.current.score) socket.off("score:update", handlersRef.current.score)
      }
      disconnectSocket()
    }
  }, [router, room, userPayload])

  useEffect(() => {
    participantsRef.current = participants
  }, [participants])

  const ensureSocket = useCallback((): Socket => {
    if (!socketRef.current) {
      socketRef.current = getSocket()
    }
    return socketRef.current
  }, [])

  const syncParticipants = useCallback((list: MultiplayerParticipant[]) => {
    setParticipants(list)
    setScores(prev => {
      const next: Record<number, { username: string | null; score: number; accuracy: number }> = {}
      for (const participant of list) {
        const existing = prev[participant.user_id]
        next[participant.user_id] = {
          username: participant.username,
          score: existing?.score ?? 0,
          accuracy: existing?.accuracy ?? 0,
        }
      }
      return next
    })
  }, [])

  const attachSocketListeners = useCallback(
    (roomCode: string) => {
      const socket = ensureSocket()

      if (handlersRef.current.presence) socket.off("room:presence", handlersRef.current.presence)
      if (handlersRef.current.start) socket.off("multiplayer:start", handlersRef.current.start)
      if (handlersRef.current.score) socket.off("score:update", handlersRef.current.score)

      const presenceHandler = (payload: RoomPresenceEvent) => {
        if (payload.roomCode !== roomCode) return
        if (payload.type === "joined") {
          const userId = payload.user?.id
          if (!userId) return
          setParticipants(prev => {
            if (prev.find(p => p.user_id === userId)) return prev
            return [...prev, { user_id: userId, username: payload.user?.username ?? null }]
          })
        } else if ((payload.type === "left" || payload.type === "disconnected") && payload.userId) {
          setParticipants(prev => prev.filter(p => p.user_id !== payload.userId))
          setScores(prev => {
            const next = { ...prev }
            delete next[payload.userId!]
            return next
          })
        }
      }

      const startHandler = (payload: MultiplayerStartPayload) => {
        if (payload.session.roomCode !== roomCode) return
        setSession(payload.session)
        setTracks(payload.tracks)
        setResultsOpen(false)
        setView("playing")
      }

      const scoreHandler = (payload: ScoreUpdatePayload) => {
        if (payload.roomCode !== roomCode) return
        setScores(prev => {
          const next = { ...prev }
          const participant = participantsRef.current.find(p => p.user_id === payload.userId)
          next[payload.userId] = {
            username: participant?.username ?? prev[payload.userId]?.username ?? null,
            score: payload.score,
            accuracy: payload.accuracy,
          }
          return next
        })
      }

      socket.on("room:presence", presenceHandler)
      socket.on("multiplayer:start", startHandler)
      socket.on("score:update", scoreHandler)

      handlersRef.current = {
        presence: presenceHandler,
        start: startHandler,
        score: scoreHandler,
      }

      if (userPayload?.user) {
        socket.emit("room:join", {
          roomCode,
          user: { id: userPayload.user.id, username: userPayload.user.username ?? undefined },
        })
      }
    },
    [ensureSocket, userPayload]
  )

  const handleCreateRoom = useCallback(async () => {
    try {
      setError(null)
      const { room: created } = await api.createRoom()
      setRoom(created)
      setView("hosting")
      attachSocketListeners(created.room_code)
      const details = await api.roomDetails(created.room_code)
      setRoom(details.room)
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
    [attachSocketListeners, joinCode, joining, syncParticipants]
  )

  const handleStartGame = useCallback(async () => {
    if (!room) return
    try {
      setStarting(true)
      setError(null)
      const { session: sessionPayload, tracks: generatedTracks } = await api.startMultiplayerGame(
        room.room_code
      )
      setSession(sessionPayload)
      setTracks(generatedTracks)
      setView("playing")
    } catch (err) {
      console.error("start_multiplayer_failed", err)
      setError(
        err instanceof Error ? err.message : "Unable to start the game. Check your library and try again."
      )
    } finally {
      setStarting(false)
    }
  }, [room])

  const handleRoundComplete = useCallback(
    ({ stats }: { stats: RoundStats }) => {
      if (!room || !userPayload) return
      const accuracy = stats.rounds > 0 ? Math.round((stats.correct / stats.rounds) * 100) : 0
      setScores(prev => ({
        ...prev,
        [userPayload.user.id]: {
          username: userPayload.user.username,
          score: stats.correct,
          accuracy,
        },
      }))
      socketRef.current?.emit("score:update", {
        roomCode: room.room_code,
        userId: userPayload.user.id,
        score: stats.correct,
        accuracy,
      })
    },
    [room, userPayload]
  )

  const handleGameComplete = useCallback(
    (stats: RoundStats) => {
      if (!room || !userPayload) return
      const accuracyValue = stats.rounds > 0 ? Math.round((stats.correct / stats.rounds) * 100) : 0
      const leaderboardSnapshot: Record<number, { username: string | null; score: number; accuracy: number }> = {
        ...scores,
        [userPayload.user.id]: {
          username: userPayload.user.username,
          score: stats.correct,
          accuracy: accuracyValue,
        },
      }
      setScores(leaderboardSnapshot)
      setFinalStats(leaderboardSnapshot)
      setView("results")
      setResultsOpen(true)
    },
    [room, scores, userPayload]
  )

  const leaderboard = useMemo(() => {
    const source = resultsOpen ? finalStats : scores
    return participants
      .map(participant => ({
        userId: participant.user_id,
        username: participant.username,
        score: source[participant.user_id]?.score ?? 0,
        accuracy: source[participant.user_id]?.accuracy ?? 0,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.accuracy - a.accuracy
      })
  }, [participants, scores, finalStats, resultsOpen])

  const handleLeaveRoom = useCallback(() => {
    if (room && userPayload) {
      socketRef.current?.emit("room:leave", { roomCode: room.room_code, userId: userPayload.user.id })
    }
    setRoom(null)
    setParticipants([])
    setScores({})
    setTracks([])
    setSession(null)
    setView("landing")
  }, [room, userPayload])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-neon" />
      </div>
    )
  }

  if (!userPayload) {
    return null
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-10">
      <Header onLeave={handleLeaveRoom} view={view} />

      {error ? (
        <div className="rounded-3xl border border-red-500/40 bg-red-500/10 px-6 py-4 text-sm text-red-200">
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
        />
      )}

      {view === "waiting" && room && (
        <WaitingLobby room={room} participants={participants} scores={scores} />
      )}

      {view === "playing" && session && tracks.length > 0 && (
        <SoloGameClient
          user={userPayload.user}
          tracks={tracks}
          mode="multiplayer"
          onRoundComplete={handleRoundComplete}
          onGameComplete={handleGameComplete}
        />
      )}

      {view === "results" && (
        <ResultsView
          leaderboard={leaderboard}
          onReturn={() => router.replace("/menu")}
          onReplay={() => {
            setView("landing")
            setRoom(null)
            setParticipants([])
            setScores({})
            setResultsOpen(false)
          }}
        />
      )}
    </main>
  )
}

function Header({ onLeave, view }: { onLeave: () => void; view: View }) {
  return (
    <div className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-black/60 p-8 backdrop-blur-2xl md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-5">
        <div className="surface flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10">
          <Users className="h-7 w-7 text-neon" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Multiplayer</p>
          <h1 className="text-3xl font-bold text-white">Blindify Rooms</h1>
          <p className="text-sm text-slate-400">
            {view === "landing"
              ? "Host a room or join your friends for synchronized blind tests."
              : "Stay synced with your friends and climb the live scoreboard."}
          </p>
        </div>
      </div>
      {view !== "landing" && (
        <Button variant="outline" onClick={onLeave} className="gap-2 self-start md:self-auto">
          <ArrowLeft className="h-4 w-4" />
          Leave lobby
        </Button>
      )}
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
  return (
    <section className="grid gap-6 md:grid-cols-2">
      <div className="surface flex flex-col gap-5 rounded-3xl border border-white/10 p-8">
        <h2 className="text-2xl font-semibold text-white">Host a neon session</h2>
        <p className="text-sm text-slate-300">
          Generate a room code, share it with friends, and launch synchronized blind test rounds with live scoring.
        </p>
        <Button onClick={onHost} className="mt-auto gap-2 self-start">
          <Sparkles className="h-4 w-4" />
          Create a room
        </Button>
      </div>
      <form
        onSubmit={onJoinSubmit}
        className="surface flex flex-col gap-5 rounded-3xl border border-white/10 p-8"
      >
        <h2 className="text-2xl font-semibold text-white">Join a room</h2>
        <p className="text-sm text-slate-300">
          Enter the six-character code shared by the host to sync instantly with the current lobby.
        </p>
        <input
          value={joinCode}
          onChange={event => setJoinCode(event.target.value.toUpperCase())}
          placeholder="Room code"
          className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-neon focus:ring-2 focus:ring-neon/40"
        />
        <Button type="submit" className="gap-2 self-start" disabled={joining}>
          {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Join room
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
}: {
  room: MultiplayerRoom
  participants: MultiplayerParticipant[]
  onStart: () => void
  starting: boolean
  scores: Record<number, { username: string | null; score: number; accuracy: number }>
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
          Share this code with friends. The game will start once you hit the button below.
        </p>
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
  onReturn,
  onReplay,
}: {
  leaderboard: Array<{ userId: number; username: string | null; score: number; accuracy: number }>
  onReturn: () => void
  onReplay: () => void
}) {
  return (
    <section className="surface flex flex-col gap-6 rounded-3xl border border-white/10 p-8 text-center">
      <PartyPopper className="mx-auto h-12 w-12 text-neon" />
      <h2 className="text-3xl font-semibold text-white">Leaderboard</h2>
      <p className="text-sm text-slate-300">
        Final results for this session. Host can create another room from the menu whenever you&apos;re ready.
      </p>
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
            {leaderboard.map((entry, index) => (
              <tr key={entry.userId} className="border-t border-white/5">
                <td className="px-6 py-3">{index + 1}</td>
                <td className="px-6 py-3">{entry.username || `Player #${entry.userId}`}</td>
                <td className="px-6 py-3 text-right font-semibold">{entry.score}</td>
                <td className="px-6 py-3 text-right">{entry.accuracy}%</td>
              </tr>
            ))}
          </tbody>
        </table>
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
