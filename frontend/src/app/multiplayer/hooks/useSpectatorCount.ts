import { useEffect, useState } from "react"
import type { Socket } from "socket.io-client"

export const SPECTATORS_EVENT = "room:spectators"

type SpectatorsPayload = { roomCode?: unknown; count?: unknown }

/**
 * Nombre de spectateurs de la salle (T18) : l'editeur de Blindz peut regarder
 * une partie en direct, et les joueurs le voient. Le serveur pousse le compte
 * a chaque arrivee ou depart d'un spectateur, et a chaque room:join. Le hook
 * le redemande aussi en s'abonnant : le compte du room:join peut arriver avant
 * que l'ecouteur soit pose (socket tout juste connecte).
 */
export function useSpectatorCount(socket: Pick<Socket, "on" | "off" | "emit"> | null, roomCode: string | null): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    setCount(0)
    if (!socket || !roomCode) return
    const handler = (payload: SpectatorsPayload) => {
      if (payload?.roomCode !== roomCode) return
      const next = payload.count
      if (typeof next === "number" && Number.isInteger(next) && next >= 0) setCount(next)
    }
    socket.on(SPECTATORS_EVENT, handler)
    socket.emit("room:spectators:get", { roomCode })
    return () => {
      socket.off(SPECTATORS_EVENT, handler)
    }
  }, [socket, roomCode])

  return count
}
