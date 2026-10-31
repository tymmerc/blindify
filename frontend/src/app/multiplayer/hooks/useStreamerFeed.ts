"use client"

/**
 * Hote d'une partie streamer (T5) : combien de viewers sont sur /live, et les
 * reponses qui arrivent pendant la manche (nombre et pseudos, jamais le texte).
 * Le serveur ne les envoie qu'a l'hote et a l'overlay.
 */
import { useEffect, useState } from "react"
import type { Socket } from "socket.io-client"
import type { TwitchStatus } from "@/lib/streamerLive"

export type StreamerFeed = {
  viewerCount: number
  answers: { round: number; count: number; names: string[] } | null
  twitch: { channel: string; status: TwitchStatus } | null
}

export function useStreamerFeed(socket: Socket | null, roomCode: string | null, enabled: boolean): StreamerFeed {
  const [feed, setFeed] = useState<StreamerFeed>({ viewerCount: 0, answers: null, twitch: null })
  useEffect(() => {
    if (!socket || !roomCode || !enabled) return
    const onViewers = (p: { roomCode?: string; count?: number } | null) => {
      if (p?.roomCode !== roomCode || typeof p.count !== "number") return
      const count = p.count
      setFeed(prev => ({ ...prev, viewerCount: count }))
    }
    const onAnswers = (p: { roomCode?: string; round?: number; count?: number; names?: string[] } | null) => {
      if (p?.roomCode !== roomCode || typeof p.round !== "number" || typeof p.count !== "number") return
      const answers = { round: p.round, count: p.count, names: Array.isArray(p.names) ? p.names.slice(0, 8) : [] }
      setFeed(prev => ({ ...prev, answers }))
    }
    const onTwitch = (p: { roomCode?: string; channel?: string; status?: TwitchStatus } | null) => {
      if (p?.roomCode !== roomCode || typeof p.channel !== "string" || !p.status) return
      const twitch = { channel: p.channel, status: p.status }
      setFeed(prev => ({ ...prev, twitch }))
    }
    socket.on("streamer:viewers", onViewers)
    socket.on("streamer:answers", onAnswers)
    socket.on("streamer:twitch", onTwitch)
    return () => {
      socket.off("streamer:viewers", onViewers)
      socket.off("streamer:answers", onAnswers)
      socket.off("streamer:twitch", onTwitch)
    }
  }, [socket, roomCode, enabled])
  return feed
}
