"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Socket } from "socket.io-client"
import { getSocket, disconnectSocket } from "@/lib/socket"
import { api } from "@/lib/api"
import type { CurrentUserPayload } from "@/lib/api"
import type { MultiplayerParticipant, MultiplayerRoom, SoloTrack } from "@/lib/types"
import { SoloGameClient, type RoundStats } from "@/components/game/SoloGameClient"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, Copy, Loader2, PartyPopper, ShieldCheck, Sparkles, Users } from "lucide-react"
import { useServerTime } from "@/hooks/useServerTime"
import { useInterval } from "@/hooks/useInterval"

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
    autoAdvance?: boolean
    stateHash?: string | null
    currentRound?: number | null
  } 
  tracks: SoloTrack[]
  autoAdvance?: boolean
  stateHash?: string | null
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
  stateHash?: string | null
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
  const [completedTracks, setCompletedTracks] = useState<SoloTrack[]>([])
  const [session, setSession] = useState<MultiplayerStartPayload["session"] | null>(null)
  const [starting, setStarting] = useState(false)
  const [joining, setJoining] = useState(false)
  const [source, setSource] = useState<string>("library")
  const [playlistId, setPlaylistId] = useState("")
  const [mySource, setMySource] = useState<string>("library")
  const [myPlaylistId, setMyPlaylistId] = useState("")
  const [savingPref, setSavingPref] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [gameStateHash, setGameStateHash] = useState<string>("")
  const [nextSignal, setNextSignal] = useState<number>(0)
  const [nextRoundNumber, setNextRoundNumber] = useState<number | null>(null)
  const [nextTrackId, setNextTrackId] = useState<string | null>(null)
  const sharedDeadlineRef = useRef<number | null>(null)

  const [scores, setScores] = useState<Record<number, { username: string | null; score: number; accuracy: number }>>(
    {}
  )
  const [finalStats, setFinalStats] = useState<Record<number, { username: string | null; score: number; accuracy: number }>>({})
  const [sharedDeadlineMs, setSharedDeadlineMs] = useState<number | null>(null)
  const lastNextRoundRef = useRef<number>(0)

  const socketRef = useRef<Socket | null>(null)
  const handlersRef = useRef<{
    presence?: (payload: RoomPresenceEvent) => void
    start?: (payload: MultiplayerStartPayload) => void
    score?: (payload: ScoreUpdatePayload) => void
    playerJoined?: (payload: { userId: number; username?: string | null; roomCode: string }) => void
    started?: (payload: {
      roomCode: string
      serverTimestamp: number
      revealAt?: number
      round?: number
      trackId?: string | number
      audioSourceId?: string | number
      stateHash?: string | null
    }) => void
    invalid?: (payload: { roomCode: string }) => void
  }>({})
  const roomRef = useRef<MultiplayerRoom | null>(null)
  const userRef = useRef<CurrentUserPayload | null>(null)

  const [joinCode, setJoinCode] = useState("")
  const [resultsOpen, setResultsOpen] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const LISTENING_MS = 45_000
  const serverNow = useServerTime(socketRef.current)

  useEffect(() => {
    const codeParam = searchParams.get("code")
    const sourceParam = searchParams.get("source")
    const playlistParam = searchParams.get("playlistId")
    if (codeParam) setJoinCode(codeParam.toUpperCase())
    if (sourceParam) {
      setSource(sourceParam)
      setMySource(sourceParam)
    }
    if (playlistParam) {
      setPlaylistId(playlistParam)
      setMyPlaylistId(playlistParam)
    }
  }, [searchParams])

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
      const latestRoom = roomRef.current
      const latestUser = userRef.current
      if (latestRoom && latestUser) {
        const socket = socketRef.current
        socket?.emit("room:leave", { roomCode: latestRoom.room_code, userId: latestUser.user.id })
      }
      const socket = socketRef.current
      if (socket && handlersRef.current) {
        if (handlersRef.current.presence) socket.off("room:presence", handlersRef.current.presence)
        if (handlersRef.current.start) socket.off("multiplayer:start", handlersRef.current.start)
        if (handlersRef.current.score) socket.off("score:update", handlersRef.current.score)
        if (handlersRef.current.playerJoined) socket.off("player-joined", handlersRef.current.playerJoined)
        if (handlersRef.current.started) socket.off("round:started", handlersRef.current.started)
        if (handlersRef.current.invalid) socket.off("state:invalid", handlersRef.current.invalid)
        socket.off("server:tick")
      }
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
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

  const savePreference = useCallback(
    async (roomCode: string, nextSource: string, nextPlaylistId?: string) => {
      setSavingPref(true)
      try {
        await api.setRoomPreference(roomCode, { source: nextSource, playlistId: nextPlaylistId })
      } catch (err) {
        console.error("save_pref_failed", err)
      } finally {
        setSavingPref(false)
      }
    },
    []
  )

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
      if (handlersRef.current.start) {
        socket.off("multiplayer:start", handlersRef.current.start)
        socket.off("game:start", handlersRef.current.start)
      }
      if (handlersRef.current.score) socket.off("score:update", handlersRef.current.score)
      if (handlersRef.current.playerJoined) socket.off("player-joined", handlersRef.current.playerJoined)
      if (handlersRef.current.started) socket.off("round:started", handlersRef.current.started)
      if (handlersRef.current.invalid) socket.off("state:invalid", handlersRef.current.invalid)

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
        setGameStateHash(payload.stateHash || payload.session.stateHash || "")
        setSession(payload.session)
        setTracks(payload.tracks)
        setAutoAdvance(Boolean(payload.session.autoAdvance ?? payload.autoAdvance))
        setSharedDeadlineMs(null)
        setNextTrackId(null)
        setNextRoundNumber(payload.session.currentRound ?? null)
        setNextSignal(0)
        sharedDeadlineRef.current = null
        lastNextRoundRef.current = payload.session.currentRound ?? 0
        setResultsOpen(false)
        setView("playing")
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }

      const scoreHandler = (payload: ScoreUpdatePayload) => {
        if (payload.roomCode !== roomCode) return
        if (payload.stateHash) setGameStateHash(payload.stateHash)
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

      const startedHandler = (payload: {
        roomCode: string
        serverTimestamp: number
        revealAt?: number
        round?: number
        trackId?: string | number
        audioSourceId?: string | number
        stateHash?: string | null
      }) => {
        if (payload.roomCode !== roomCode) return
        // Allow re-playing the same round index to resync late guests (only drop older rounds)
        if (typeof payload.round === "number") {
          if (payload.round < lastNextRoundRef.current) return
          lastNextRoundRef.current = Math.max(lastNextRoundRef.current, payload.round)
        }
        if (payload.stateHash) setGameStateHash(payload.stateHash)
        const now = Date.now()
        const safeReveal =
          payload.revealAt && Number.isFinite(payload.revealAt) && payload.revealAt > now - 1000
            ? payload.revealAt
            : now + LISTENING_MS
        sharedDeadlineRef.current = safeReveal
        setSharedDeadlineMs(safeReveal)
        if (typeof payload.round === "number") setNextRoundNumber(payload.round)
        const resolvedTrackId = payload.trackId ?? payload.audioSourceId
        setNextTrackId(resolvedTrackId != null ? String(resolvedTrackId) : null)
        setNextSignal(prev => prev + 1)
      }

      const playerJoinedHandler = (payload: { userId: number; username?: string | null; roomCode: string }) => {
        if (payload.roomCode !== roomCode) return
        setParticipants(prev => {
          if (prev.find(p => p.user_id === payload.userId)) return prev
          return [...prev, { user_id: payload.userId, username: payload.username ?? null }]
        })
      }

      const invalidHandler = async (payload: { roomCode: string }) => {
        if (payload.roomCode !== roomCode) return
        try {
          const latest = await api.roomState(roomCode)
          setRoom(latest.room)
          setAutoAdvance(Boolean(latest.session?.autoAdvance ?? latest.room.auto_advance ?? autoAdvance))
          if (latest.session && latest.tracks.length) {
            setSession(latest.session)
            setTracks(latest.tracks)
            setGameStateHash(latest.session.stateHash || "")
            lastNextRoundRef.current = latest.session.currentRound ?? 0
            setNextRoundNumber(latest.session.currentRound ?? null)
            setNextTrackId(null)
            setNextSignal(0)
            sharedDeadlineRef.current = null
            setSharedDeadlineMs(null)
            setView("playing")
          }
        } catch (err) {
          console.error("state_resync_failed", err)
          setError(err instanceof Error ? err.message : "Impossible de resynchroniser la partie.")
        }
      }

      socket.on("room:presence", presenceHandler)
      socket.on("multiplayer:start", startHandler)
      socket.on("game:start", startHandler) // compat
      socket.on("score:update", scoreHandler)
      socket.on("player-joined", playerJoinedHandler)
      socket.on("round:started", startedHandler)
      socket.on("server:tick", () => {})
      socket.on("state:invalid", invalidHandler)

      handlersRef.current = {
        presence: presenceHandler,
        start: startHandler,
        score: scoreHandler,
        playerJoined: playerJoinedHandler,
        started: startedHandler,
        invalid: invalidHandler,
      }

      if (userPayload?.user) {
        socket.emit("room:join", {
          roomCode,
          user: { id: userPayload.user.id, username: userPayload.user.username ?? undefined },
        })
      }
    },
    [ensureSocket, userPayload, autoAdvance]
  )

  const handleCreateRoom = useCallback(async () => {
    try {
      setError(null)
      const { room: created } = await api.createRoom({ autoAdvance, questionCount: 10 })
      setRoom(created)
      setView("hosting")
      attachSocketListeners(created.room_code)
      const details = await api.roomDetails(created.room_code)
      setRoom(details.room)
      setAutoAdvance(Boolean(details.room.auto_advance))
      syncParticipants(details.participants)
      if (details.selfPreference) {
        setMySource(details.selfPreference.source_pref ?? "library")
        setMyPlaylistId(details.selfPreference.playlist_pref ?? "")
      }
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        try {
          const updated = await api.roomDetails(created.room_code)
          setAutoAdvance(Boolean(updated.room.auto_advance))
          setParticipants(prev => {
            const next = updated.participants
            if (JSON.stringify(prev) !== JSON.stringify(next)) return next
            return prev
          })
            if (updated.room.status === "in_progress") {
              const state = await api.roomState(created.room_code)
              if (state.session && state.tracks.length) {
                setGameStateHash(state.session.stateHash || "")
                setSession(state.session)
                setTracks(state.tracks)
                lastNextRoundRef.current = state.session.currentRound ?? 0
                setResultsOpen(false)
                setNextRoundNumber(state.session.currentRound ?? null)
                sharedDeadlineRef.current = null
                setView("playing")
                if (pollRef.current) {
                  clearInterval(pollRef.current)
                  pollRef.current = null
                }
              }
            }
        } catch {
          // ignore polling errors
        }
      }, 4000)
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
        setAutoAdvance(Boolean(joined.auto_advance))
        setView("waiting")
        attachSocketListeners(joined.room_code)
        const details = await api.roomDetails(joined.room_code)
        setRoom(details.room)
        setAutoAdvance(Boolean(details.room.auto_advance))
        syncParticipants(details.participants)
        if (details.selfPreference) {
          setMySource(details.selfPreference.source_pref ?? "library")
          setMyPlaylistId(details.selfPreference.playlist_pref ?? "")
        }
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
          try {
            const updated = await api.roomDetails(joined.room_code)
            setAutoAdvance(Boolean(updated.room.auto_advance))
            setParticipants(prev => {
              const next = updated.participants
              if (JSON.stringify(prev) !== JSON.stringify(next)) return next
              return prev
            })
            if (updated.room.status === "in_progress") {
              const state = await api.roomState(joined.room_code)
              if (state.session && state.tracks.length) {
                setGameStateHash(state.session.stateHash || "")
                setSession(state.session)
                setTracks(state.tracks)
                lastNextRoundRef.current = state.session.currentRound ?? 0
                sharedDeadlineRef.current = null
                setResultsOpen(false)
                setView("playing")
                if (pollRef.current) {
                  clearInterval(pollRef.current)
                  pollRef.current = null
                }
              }
            }
          } catch {
            // ignore polling errors
          }
        }, 4000)
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
        source,
        autoAdvance,
      }
      if (source === "playlist" && playlistId.trim()) {
        payload.playlistId = playlistId.trim()
      }
      const { session: sessionPayload, tracks: generatedTracks } = await api.startMultiplayerGame(
        room.room_code,
        payload
      )
      setGameStateHash(sessionPayload.stateHash || "")
      setSession(sessionPayload)
      setTracks(generatedTracks)
      setCompletedTracks([])
      setView("playing")
    } catch (err) {
      console.error("start_multiplayer_failed", err)
      setError(
        err instanceof Error ? err.message : "Unable to start the game. Check your library and try again."
      )
    } finally {
      setStarting(false)
    }
  }, [room, playlistId, source])

  const handleRoundComplete = useCallback(
    ({ stats }: { stats: RoundStats }) => {
      if (!room || !userPayload) return
      const accuracy = stats.rounds > 0 ? Math.round((stats.correct / stats.rounds) * 100) : 0
      setScores(prev => ({
        ...prev,
        [userPayload.user.id]: {
          username: userPayload.user.username,
          score: stats.points,
          accuracy,
        },
      }))
      socketRef.current?.emit("score:update", {
        roomCode: room.room_code,
        userId: userPayload.user.id,
        score: stats.points,
        accuracy,
        stateHash: gameStateHash,
      })
    },
    [room, userPayload, gameStateHash]
  )

  const handleGameComplete = useCallback(
    (stats: RoundStats) => {
      if (!room || !userPayload) return
      const accuracyValue = stats.rounds > 0 ? Math.round((stats.correct / stats.rounds) * 100) : 0
      const leaderboardSnapshot: Record<number, { username: string | null; score: number; accuracy: number }> = {
        ...scores,
        [userPayload.user.id]: {
          username: userPayload.user.username,
          score: stats.points,
          accuracy: accuracyValue,
        },
      }
      setScores(leaderboardSnapshot)
      setFinalStats(leaderboardSnapshot)
      setCompletedTracks(tracks)
      setView("results")
      setResultsOpen(true)
    },
    [room, scores, userPayload, tracks]
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

  const handleMySourceChange = useCallback(
    (value: string) => {
      setMySource(value)
      if (room) {
        const playlistValue = value === "playlist" ? myPlaylistId : ""
        savePreference(room.room_code, value, playlistValue)
        setMyPlaylistId(playlistValue)
      }
    },
    [room, myPlaylistId, savePreference]
  )

  const handleMyPlaylistChange = useCallback(
    (value: string) => {
      setMyPlaylistId(value)
      if (room) {
        savePreference(room.room_code, mySource, value)
      }
    },
    [room, mySource, savePreference]
  )

  const handleLeaveRoom = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (room && userPayload) {
      socketRef.current?.emit("room:leave", { roomCode: room.room_code, userId: userPayload.user.id })
    }
    setRoom(null)
    setParticipants([])
    setScores({})
    setTracks([])
    setSession(null)
    setGameStateHash("")
    setSource("library")
    setPlaylistId("")
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
    return null
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <Header onLeave={handleLeaveRoom} view={view} />

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
            source={source}
            setSource={setSource}
            playlistId={playlistId}
            setPlaylistId={setPlaylistId}
            mySource={mySource}
            setMySource={value => {
              setMySource(value)
              if (room) {
                const playlistValue = value === "playlist" ? myPlaylistId : ""
                setMyPlaylistId(playlistValue)
                savePreference(room.room_code, value, playlistValue)
              }
            }}
            myPlaylistId={myPlaylistId}
            setMyPlaylistId={value => {
              setMyPlaylistId(value)
              if (room) {
                savePreference(room.room_code, mySource, value)
              }
            }}
            onSavePreference={() => {
              if (room) savePreference(room.room_code, mySource, myPlaylistId)
            }}
            savingPref={savingPref}
            autoAdvance={autoAdvance}
            setAutoAdvance={setAutoAdvance}
          />
        )}

        {view === "waiting" && room && (
          <WaitingLobby
            room={room}
            participants={participants}
            scores={scores}
            mySource={mySource}
            setMySource={value => {
              setMySource(value)
              if (room) {
                const playlistValue = value === "playlist" ? myPlaylistId : ""
                setMyPlaylistId(playlistValue)
                savePreference(room.room_code, value, playlistValue)
              }
            }}
            myPlaylistId={myPlaylistId}
            setMyPlaylistId={value => {
              setMyPlaylistId(value)
              if (room) {
                savePreference(room.room_code, mySource, value)
              }
            }}
            onSavePreference={() => {
              if (room) savePreference(room.room_code, mySource, myPlaylistId)
            }}
            savingPref={savingPref}
          />
        )}

        {view === "playing" && session && tracks.length > 0 && (
    <SoloGameClient
      user={userPayload.user}
      tracks={tracks}
      mode="multiplayer"
      isHost={room?.host_user_id === userPayload.user.id}
      autoAdvance={autoAdvance}
      sharedDeadlineMs={sharedDeadlineMs}
      nextSignal={nextSignal}
      nextRoundNumber={nextRoundNumber ?? undefined}
      nextTrackId={nextTrackId ?? undefined}
      onHostNext={(nextRound, revealAt) => {
        const socket = socketRef.current
        if (!socket || !room) return
        socket.emit("round:next", {
          stateHash: gameStateHash,
          roomCode: room.room_code,
          round: nextRound,
          revealAt,
        })
      }}
      leaderboard={leaderboard}
      onRoundComplete={handleRoundComplete}
      onGameComplete={handleGameComplete}
      roomCode={room?.room_code}
    />
        )}

        {view === "results" && (
          <ResultsView
            leaderboard={leaderboard}
            tracks={completedTracks}
            onReturn={() => router.replace("/menu")}
            onReplay={() => {
              setView("landing")
              setRoom(null)
              setParticipants([])
              setScores({})
              setResultsOpen(false)
              setSession(null)
              setTracks([])
              setGameStateHash("")
              setSource("library")
              setPlaylistId("")
              setCompletedTracks([])
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
        <input
          value={joinCode}
          onChange={event => setJoinCode(event.target.value.toUpperCase())}
          placeholder="Room code"
          className="w-full rounded-lg border border-[var(--ma-border)] bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-[rgba(168,85,247,0.5)]"
        />
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
  source,
  setSource,
  playlistId,
  setPlaylistId,
  mySource,
  setMySource,
  myPlaylistId,
  setMyPlaylistId,
  onSavePreference,
  savingPref,
  autoAdvance,
  setAutoAdvance,
}: {
  room: MultiplayerRoom
  participants: MultiplayerParticipant[]
  onStart: () => void
  starting: boolean
  scores: Record<number, { username: string | null; score: number; accuracy: number }>
  source: string
  setSource: (value: string) => void
  playlistId: string
  setPlaylistId: (value: string) => void
  mySource: string
  setMySource: (value: string) => void
  myPlaylistId: string
  setMyPlaylistId: (value: string) => void
  onSavePreference: () => void
  savingPref: boolean
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
          <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Source</label>
          <select
            value={source}
            onChange={event => setSource(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-neon focus:ring-2 focus:ring-neon/30"
          >
            <option value="library">Bibliothèque (aléatoire)</option>
            <option value="liked">Titres likés</option>
            <option value="top_week">Top semaine</option>
            <option value="top_month">Top mois</option>
            <option value="top_all">Top toujours</option>
            <option value="playlist">Playlist (ID Spotify)</option>
          </select>
          {source === "playlist" && (
            <input
              value={playlistId}
              onChange={event => setPlaylistId(event.target.value)}
              placeholder="ID ou URL de playlist Spotify"
              className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-neon focus:ring-2 focus:ring-neon/30"
            />
          )}
          <p className="text-xs text-slate-400">
            Les modes playlist/top nécessitent une connexion Spotify du host (token valide).
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
            <span>Ta source à partager</span>
            {savingPref ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : null}
          </div>
          <select
            value={mySource}
            onChange={event => setMySource(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-neon focus:ring-2 focus:ring-neon/30"
          >
            <option value="library">Ma bibliothèque</option>
            <option value="liked">Mes titres likés</option>
            <option value="playlist">Ma playlist (ID)</option>
            <option value="top_week">Top semaine</option>
            <option value="top_month">Top mois</option>
            <option value="top_all">Top toujours</option>
          </select>
          {mySource === "playlist" && (
            <input
              value={myPlaylistId}
              onChange={event => setMyPlaylistId(event.target.value)}
              placeholder="ID ou URL de playlist Spotify"
              className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-neon focus:ring-2 focus:ring-neon/30"
            />
          )}
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onSavePreference} disabled={savingPref} className="gap-2">
              {savingPref ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enregistrer ma source
            </Button>
          </div>
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
  mySource,
  setMySource,
  myPlaylistId,
  setMyPlaylistId,
  onSavePreference,
  savingPref,
}: {
  room: MultiplayerRoom
  participants: MultiplayerParticipant[]
  scores: Record<number, { username: string | null; score: number; accuracy: number }>
  mySource: string
  setMySource: (value: string) => void
  myPlaylistId: string
  setMyPlaylistId: (value: string) => void
  onSavePreference: () => void
  savingPref: boolean
}) {
  return (
    <section className="surface flex flex-col gap-6 rounded-3xl border border-white/10 p-8 text-center">
      <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Waiting for host</p>
      <h2 className="text-2xl font-semibold text-white">Stay tuned</h2>
      <p className="text-sm text-slate-300">
        Once the host starts the game, a synchronized blind test will begin automatically. Keep Spotify open and ready.
      </p>
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
          <span>Ta source à partager</span>
          {savingPref ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : null}
        </div>
        <select
          value={mySource}
          onChange={event => setMySource(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-neon focus:ring-2 focus:ring-neon/30"
        >
          <option value="library">Ma bibliothèque</option>
          <option value="liked">Mes titres likés</option>
          <option value="playlist">Ma playlist (ID)</option>
          <option value="top_week">Top semaine</option>
          <option value="top_month">Top mois</option>
          <option value="top_all">Top toujours</option>
        </select>
        {mySource === "playlist" && (
          <input
            value={myPlaylistId}
            onChange={event => setMyPlaylistId(event.target.value)}
            placeholder="ID ou URL de playlist Spotify"
            className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-neon focus:ring-2 focus:ring-neon/30"
          />
        )}
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onSavePreference} disabled={savingPref} className="gap-2">
            {savingPref ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enregistrer ma source
          </Button>
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
  onReturn,
  onReplay,
}: {
  leaderboard: Array<{ userId: number; username: string | null; score: number; accuracy: number }>
  tracks: SoloTrack[]
  onReturn: () => void
  onReplay: () => void
}) {
  const podium = leaderboard.slice(0, 3)
  const rest = leaderboard.slice(3)

  return (
    <section className="surface flex flex-col gap-6 rounded-3xl border border-white/10 p-8 text-center">
      <PartyPopper className="mx-auto h-12 w-12 text-neon" />
      <h2 className="text-3xl font-semibold text-white">Résumé de la manche</h2>
      <p className="text-sm text-slate-300">Top 3 en mode podium et récap des titres joués.</p>

      <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 md:grid-cols-3">
        {podium.map((entry, index) => {
          const rank = index + 1
          const colors = [
            "from-amber-400/50 to-yellow-500/30",
            "from-slate-200/40 to-blue-400/30",
            "from-rose-400/40 to-purple-500/30",
          ]
          return (
            <div
              key={entry.userId}
              className={`rounded-2xl border border-white/10 bg-gradient-to-br ${colors[index] ?? "from-white/10 to-white/5"} px-4 py-5 text-left shadow-[0_15px_40px_rgba(0,0,0,0.25)]`}
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.35em] text-white/70">
                <span>#{rank}</span>
                <span>{entry.accuracy}% précision</span>
              </div>
              <div className="mt-2 text-lg font-semibold text-white">{entry.username || `Joueur ${entry.userId}`}</div>
              <div className="text-sm text-white/80">{entry.score} pts</div>
            </div>
          )
        })}
        {podium.length === 0 && <div className="col-span-3 text-sm text-slate-400">Aucun score.</div>}
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
          <h3 className="text-lg font-semibold text-white">Titres joués</h3>
          <span className="text-xs uppercase tracking-[0.35em] text-slate-400">{tracks.length} titres</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {tracks.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun titre disponible.</p>
          ) : (
            tracks.map((track, idx) => (
              <div
                key={`${track.audioSourceId ?? track.track_id}-${idx}`}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-black/30 px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-semibold text-white">{track.title}</div>
                  <div className="text-xs text-slate-400">{track.artist}</div>
                </div>
                <span className="text-xs text-slate-400">#{idx + 1}</span>
              </div>
            ))
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
