import { useCallback, useEffect, useMemo, useState } from "react"
import type { Socket } from "socket.io-client"
import { api } from "@/lib/api"
import { getSocket } from "@/lib/socket"
import type { FriendEntry } from "@/lib/types"
import { usePresenceSocket } from "./usePresenceSocket"
import type { FriendPresence } from "@/lib/types"

function upsert(list: FriendEntry[], item: FriendEntry): FriendEntry[] {
  const next = [...list]
  const idx = next.findIndex(f => f.userId === item.userId)
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...item }
  } else {
    next.unshift(item)
  }
  return next
}

export function useFriends() {
  const { socket, statuses } = usePresenceSocket(true)
  const [friends, setFriends] = useState<FriendEntry[]>([])
  const [incoming, setIncoming] = useState<FriendEntry[]>([])
  const [outgoing, setOutgoing] = useState<FriendEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalizePresence = useCallback((presence?: FriendPresence) => {
    if (!presence) return undefined
    const status =
      presence.status ??
      (presence.online ? (presence.activity === "playing" ? "playing" : "online") : "offline")
    const roomCode = presence.roomCode ?? (presence.context?.type === "room" ? presence.context.id : null)
    return { ...presence, status, roomCode }
  }, [])

  const withPresence = useCallback(
    (list: FriendEntry[]) =>
      list.map(friend => {
        const presence = statuses[friend.userId]
        return presence
          ? {
              ...friend,
              presence: normalizePresence(presence),
            }
          : friend
      }),
    [statuses, normalizePresence]
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await api.listFriends()
      setFriends(withPresence(payload.friends ?? []))
      setIncoming(withPresence(payload.incoming ?? []))
      setOutgoing(withPresence(payload.outgoing ?? []))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible de charger vos amis."
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [withPresence])

  useEffect(() => {
    reload()
  }, [reload])

  // Keep presence in sync
  useEffect(() => {
    setFriends(prev => withPresence(prev))
    setIncoming(prev => withPresence(prev))
    setOutgoing(prev => withPresence(prev))
  }, [withPresence])

  useEffect(() => {
    if (!socket) return
    const handleRequest = (payload: { friendship?: FriendEntry }) => {
      if (!payload?.friendship) return
      const enriched = withPresence([payload.friendship])[0]
      if (!enriched) return
      setIncoming(prev => upsert(prev, enriched))
    }
    const handleAccepted = (payload: { friendship?: FriendEntry }) => {
      if (!payload?.friendship) return
      const withStatus = withPresence([payload.friendship])[0]
      if (!withStatus) return
      setFriends(prev => upsert(prev, withStatus))
      setIncoming(prev => prev.filter(f => f.userId !== payload.friendship?.userId))
      setOutgoing(prev => prev.filter(f => f.userId !== payload.friendship?.userId))
    }
    const handleRemoved = (payload: { userId?: number }) => {
      if (!payload?.userId) return
      setFriends(prev => prev.filter(f => f.userId !== payload.userId))
      setIncoming(prev => prev.filter(f => f.userId !== payload.userId))
      setOutgoing(prev => prev.filter(f => f.userId !== payload.userId))
    }
    const handleDeclined = (payload: { byUserId?: number }) => {
      if (!payload?.byUserId) return
      setOutgoing(prev => prev.filter(f => f.userId !== payload.byUserId))
    }

    socket.on("friend:request", handleRequest)
    socket.on("friend:accepted", handleAccepted)
    socket.on("friend:removed", handleRemoved)
    socket.on("friend:request:declined", handleDeclined)

    return () => {
      socket.off("friend:request", handleRequest)
      socket.off("friend:accepted", handleAccepted)
      socket.off("friend:removed", handleRemoved)
      socket.off("friend:request:declined", handleDeclined)
    }
  }, [socket, withPresence])

  const requestFriend = useCallback(
    async (identifier: string) => {
      setError(null)
      await api.requestFriend(identifier)
      await reload()
    },
    [reload]
  )

  const acceptFriend = useCallback(
    async (userId: number) => {
      setError(null)
      await api.acceptFriend(userId)
      await reload()
    },
    [reload]
  )

  const declineFriend = useCallback(
    async (userId: number) => {
      setError(null)
      await api.declineFriend(userId)
      await reload()
    },
    [reload]
  )

  const removeFriend = useCallback(
    async (userId: number) => {
      setError(null)
      await api.removeFriend(userId)
      await reload()
    },
    [reload]
  )

  const onlineCount = useMemo(
    () => friends.filter(f => f.presence?.status && f.presence.status !== "offline").length,
    [friends]
  )

  return {
    socket: socket as Socket | null,
    friends,
    incoming,
    outgoing,
    loading,
    error,
    onlineCount,
    requestFriend,
    acceptFriend,
    declineFriend,
    removeFriend,
    refresh: reload,
  }
}
