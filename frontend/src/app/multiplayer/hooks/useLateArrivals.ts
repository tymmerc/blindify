import { useEffect, useRef } from "react"
import type { Socket } from "socket.io-client"

export interface LateArrival {
  roomCode: string
  userId: number
  username: string | null
}

/**
 * Arrivee en cours de partie (T19) : le serveur annonce a la salle qu'un
 * joueur arrive (game:waiting). `onArrival` recoit les arrivees des AUTRES
 * joueurs de cette salle ; celui qui arrive a sa propre vue d'attente.
 */
export function useLateArrivals(
  socket: Socket | null,
  roomCode: string | null,
  selfId: number | null,
  onArrival: (arrival: LateArrival) => void,
): void {
  // Le dernier rappel, sans re-poser l'ecouteur a chaque rendu.
  const callback = useRef(onArrival)
  callback.current = onArrival

  useEffect(() => {
    if (!socket || !roomCode) return
    const handler = (payload: Partial<LateArrival> | null) => {
      if (!payload || payload.roomCode !== roomCode || typeof payload.userId !== "number") return
      if (payload.userId === selfId) return
      callback.current({ roomCode, userId: payload.userId, username: payload.username ?? null })
    }
    socket.on("game:waiting", handler)
    return () => {
      socket.off("game:waiting", handler)
    }
  }, [socket, roomCode, selfId])
}
