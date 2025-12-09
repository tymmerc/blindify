import { useEffect, useRef, useState } from "react"
import { useInterval } from "./useInterval"

export function useServerTime(socket: { on: Function; off: Function } | null) {
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
