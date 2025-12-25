import { useEffect, useRef, useState } from "react"
import { useInterval } from "./useInterval"

type ServerTickSocket = {
  on: (event: string, handler: (payload: { serverTimestamp: number }) => void) => void
  off: (event: string, handler: (payload: { serverTimestamp: number }) => void) => void
}

export function useServerTime(socket: ServerTickSocket | null) {
  const [serverTime, setServerTime] = useState<number>(Date.now())
  const driftRef = useRef<number>(0)

  useEffect(() => {
    if (!socket) return
    const handler = (payload: { serverTimestamp: number }) => {
      if (typeof payload?.serverTimestamp !== "number") return
      const now = Date.now()
      driftRef.current = payload.serverTimestamp - now
      setServerTime(payload.serverTimestamp)
    }
    socket.on("server:tick", handler)
    return () => {
      socket.off("server:tick", handler)
    }
  }, [socket])

  useInterval(() => {
    setServerTime(Date.now() + driftRef.current)
  }, 1000)

  return serverTime
}
