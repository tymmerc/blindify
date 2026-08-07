import { useEffect, useState, useCallback, useRef } from "react"
import type { Socket } from "socket.io-client"

export type RpsMove = "rock" | "paper" | "scissors"

export type RpsScoreEntry = { userId: number; username: string | null; wins: number }

export type RpsIncoming = { matchId: string; fromUserId: number; fromUsername: string | null }

export type RpsActive = {
  matchId: string
  opponentId: number
  opponentName: string | null
  myMove: RpsMove | null
}

export type RpsResult = {
  matchId: string
  a: number
  b: number
  aMove: RpsMove
  bMove: RpsMove
  winnerUserId: number | null
}

type UseLobbyRps = {
  scoreboard: RpsScoreEntry[]
  incoming: RpsIncoming | null
  active: RpsActive | null
  pendingTargetId: number | null
  result: RpsResult | null
  challenge: (targetUserId: number) => void
  accept: () => void
  decline: () => void
  play: (move: RpsMove) => void
}

/**
 * Pierre-feuille-ciseaux de lobby. Tout transite par le socket, broadcast a la
 * salle, et on filtre selon currentUserId. Un seul duel actif a la fois cote UI.
 */
export function useLobbyRps(socket: Socket | null, roomCode: string | null, currentUserId: number): UseLobbyRps {
  const [scoreboard, setScoreboard] = useState<RpsScoreEntry[]>([])
  const [incoming, setIncoming] = useState<RpsIncoming | null>(null)
  const [active, setActive] = useState<RpsActive | null>(null)
  const [pendingTargetId, setPendingTargetId] = useState<number | null>(null)
  const [result, setResult] = useState<RpsResult | null>(null)
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!socket || !roomCode) return

    const onChallenge = (p: { matchId: string; fromUserId: number; fromUsername: string | null; targetUserId: number }) => {
      if (p.targetUserId === currentUserId) {
        setIncoming({ matchId: p.matchId, fromUserId: p.fromUserId, fromUsername: p.fromUsername })
      } else if (p.fromUserId === currentUserId) {
        setPendingTargetId(p.targetUserId)
      }
    }

    const onStart = (p: { matchId: string; a: number; b: number; aName: string | null; bName: string | null }) => {
      if (p.a !== currentUserId && p.b !== currentUserId) return
      const iAmA = p.a === currentUserId
      setActive({
        matchId: p.matchId,
        opponentId: iAmA ? p.b : p.a,
        opponentName: iAmA ? p.bName : p.aName,
        myMove: null,
      })
      setIncoming(null)
      setPendingTargetId(null)
    }

    const onDeclined = (p: { matchId: string; byUserId: number }) => {
      setIncoming(prev => (prev && prev.matchId === p.matchId ? null : prev))
      setPendingTargetId(null)
    }

    const onResult = (p: RpsResult) => {
      if (p.a === currentUserId || p.b === currentUserId) {
        setResult(p)
        setActive(null)
        if (resultTimer.current) clearTimeout(resultTimer.current)
        resultTimer.current = setTimeout(() => setResult(null), 3500)
      }
    }

    const onScoreboard = (p: { scoreboard: RpsScoreEntry[] }) => {
      setScoreboard(p.scoreboard ?? [])
    }

    socket.on("lobby:rps:challenge", onChallenge)
    socket.on("lobby:rps:start", onStart)
    socket.on("lobby:rps:declined", onDeclined)
    socket.on("lobby:rps:result", onResult)
    socket.on("lobby:rps:scoreboard", onScoreboard)
    return () => {
      socket.off("lobby:rps:challenge", onChallenge)
      socket.off("lobby:rps:start", onStart)
      socket.off("lobby:rps:declined", onDeclined)
      socket.off("lobby:rps:result", onResult)
      socket.off("lobby:rps:scoreboard", onScoreboard)
      if (resultTimer.current) clearTimeout(resultTimer.current)
    }
  }, [socket, roomCode, currentUserId])

  // Reset quand la salle change
  useEffect(() => {
    setScoreboard([])
    setIncoming(null)
    setActive(null)
    setPendingTargetId(null)
    setResult(null)
  }, [roomCode])

  const challenge = useCallback(
    (targetUserId: number) => {
      if (!socket || !roomCode) return
      socket.emit("lobby:rps:challenge", { roomCode, targetUserId })
    },
    [socket, roomCode]
  )

  const accept = useCallback(() => {
    if (!socket || !roomCode || !incoming) return
    socket.emit("lobby:rps:accept", { roomCode, matchId: incoming.matchId })
  }, [socket, roomCode, incoming])

  const decline = useCallback(() => {
    if (!socket || !roomCode || !incoming) return
    socket.emit("lobby:rps:decline", { roomCode, matchId: incoming.matchId })
    setIncoming(null)
  }, [socket, roomCode, incoming])

  const play = useCallback(
    (move: RpsMove) => {
      if (!socket || !roomCode || !active || active.myMove) return
      socket.emit("lobby:rps:move", { roomCode, matchId: active.matchId, move })
      setActive(prev => (prev ? { ...prev, myMove: move } : prev))
    },
    [socket, roomCode, active]
  )

  return { scoreboard, incoming, active, pendingTargetId, result, challenge, accept, decline, play }
}
