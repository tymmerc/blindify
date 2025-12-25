import { useCallback, useEffect, useState } from "react"
import type { Socket } from "socket.io-client"
import { api } from "@/lib/api"
import { getSocket } from "@/lib/socket"
import type { RoomInvitation } from "@/lib/types"

type InvitationToast = {
  id: number
  fromUsername?: string | null
  roomCode: string
  expiresAt?: string
  state?: "incoming" | "expired"
  message?: string
}

type InviteEventPayload = {
  invitationId?: number
  roomId?: number | null
  roomCode?: string
  fromUser?: { id?: number; username?: string | null; avatar?: string | null }
  fromUserId?: number
  expiresAt?: string
}

function upsertInvitation(list: RoomInvitation[], next: RoomInvitation): RoomInvitation[] {
  const copy = [...list]
  const idx = copy.findIndex(inv => inv.id === next.id)
  if (idx >= 0) {
    copy[idx] = { ...copy[idx], ...next }
  } else {
    copy.unshift(next)
  }
  return copy
}

export function useInvitations() {
  const [pending, setPending] = useState<RoomInvitation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<InvitationToast[]>([])
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await api.listInvitations()
        if (!cancelled) setPending(res.invitations ?? [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Impossible de charger les invitations.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const s = getSocket()
    setSocket(s)
    const handleInvite = (payload: InviteEventPayload) => {
      if (!payload?.invitationId) return
      const invitation: RoomInvitation = {
        id: payload.invitationId,
        roomId: payload.roomId ?? null,
        roomCode: payload.roomCode ?? "",
        fromUser: payload.fromUser?.id ?? payload.fromUserId ?? 0,
        toUser: 0,
        status: "pending",
        expiresAt: payload.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        fromUsername: payload.fromUser?.username ?? null,
        fromAvatar: payload.fromUser?.avatar ?? null,
      }
      setPending(prev => upsertInvitation(prev, invitation))
      setToasts(prev => [
        ...prev.slice(-2),
        { id: invitation.id, fromUsername: invitation.fromUsername, roomCode: invitation.roomCode, expiresAt: invitation.expiresAt, state: "incoming" },
      ])
    }
    const handleAccepted = (payload: { invitationId?: number }) => {
      if (!payload?.invitationId) return
      setPending(prev => prev.filter(inv => inv.id !== payload.invitationId))
    }
    const handleDeclined = (payload: { invitationId?: number }) => {
      if (!payload?.invitationId) return
      setPending(prev => prev.filter(inv => inv.id !== payload.invitationId))
    }
    const handleExpired = (payload: { invitationId?: number; roomCode?: string }) => {
      const id = typeof payload?.invitationId === "number" ? payload.invitationId : null
      if (!id) return
      setPending(prev => prev.filter(inv => inv.id !== id))
      setToasts(prev => [
        ...prev.slice(-2),
        {
          id,
          roomCode: payload.roomCode ?? "—",
          state: "expired",
          message: "Invitation expirée",
        },
      ])
    }
    s.on("room:invite", handleInvite)
    s.on("room:invite:accepted", handleAccepted)
    s.on("room:invite:declined", handleDeclined)
    s.on("room:invite:expired", handleExpired)
    return () => {
      s.off("room:invite", handleInvite)
      s.off("room:invite:accepted", handleAccepted)
      s.off("room:invite:declined", handleDeclined)
      s.off("room:invite:expired", handleExpired)
    }
  }, [])

  const sendInvitation = useCallback(
    async (toUserId: number, roomCode: string) => {
      setError(null)
      const res = await api.sendInvitation(toUserId, roomCode)
      setPending(prev => upsertInvitation(prev, res.invitation))
      return res
    },
    []
  )

  const acceptInvitation = useCallback(async (invitationId: number) => {
    setError(null)
    const res = await api.acceptInvitation(invitationId)
    setPending(prev => prev.filter(inv => inv.id !== invitationId))
    return res
  }, [])

  const declineInvitation = useCallback(async (invitationId: number) => {
    setError(null)
    await api.declineInvitation(invitationId)
    setPending(prev => prev.filter(inv => inv.id !== invitationId))
  }, [])

  const consumeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    const timers = toasts.map(toast =>
      setTimeout(() => {
        consumeToast(toast.id)
      }, 7000)
    )
    return () => {
      timers.forEach(timer => clearTimeout(timer))
    }
  }, [toasts, consumeToast])

  return {
    socket,
    pending,
    loading,
    error,
    toasts,
    sendInvitation,
    acceptInvitation,
    declineInvitation,
    consumeToast,
  }
}
