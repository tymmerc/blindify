import { useEffect, useState } from "react"
import type { Socket } from "socket.io-client"
import { getSocket } from "@/lib/socket"
import type { FriendPresence } from "@/lib/types"

export type PresenceSnapshot = FriendPresence & {
  userId: number
  username?: string | null
}

export function usePresenceSocket(enable = true) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [statuses, setStatuses] = useState<Record<number, PresenceSnapshot>>({})

  const normalize = (payload: PresenceSnapshot): PresenceSnapshot => {
    const roomCode = payload.roomCode ?? (payload.context?.type === "room" ? payload.context.id : null)
    const status =
      payload.status ?? (payload.online ? (payload.activity === "playing" ? "playing" : "online") : "offline")
    return {
      ...payload,
      roomCode,
      status,
      context: payload.context ?? (roomCode ? { type: "room", id: roomCode } : undefined),
    }
  }

  useEffect(() => {
    if (!enable) return
    const s = getSocket()
    setSocket(s)

    const sendHeartbeat = () => {
      s.emit("presence:heartbeat")
    }
    sendHeartbeat()
    const heartbeat = setInterval(sendHeartbeat, 5000)
    s.on("connect", sendHeartbeat)

    const handleInit = (list: PresenceSnapshot[]) => {
      const next: Record<number, PresenceSnapshot> = {}
      list?.forEach(item => {
        next[item.userId] = normalize(item)
      })
      setStatuses(next)
    }
    const handleUpdate = (payload: PresenceSnapshot) => {
      if (!payload?.userId) return
      setStatuses(prev => ({
        ...prev,
        [payload.userId]: normalize(payload),
      }))
    }

    s.on("friends:status:init", handleInit)
    s.on("friends:status:update", handleUpdate)

    return () => {
      clearInterval(heartbeat)
      s.off("connect", sendHeartbeat)
      s.off("friends:status:init", handleInit)
      s.off("friends:status:update", handleUpdate)
    }
  }, [enable])

  return { socket, statuses }
}
