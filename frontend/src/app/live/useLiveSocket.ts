"use client"

/**
 * Socket du viewer de /live (T5). Pas de cookie ni de compte : le code de la
 * salle, un pseudo, et la cle de reprise rendue par le serveur, gardee dans
 * le navigateur pour revenir apres une coupure avec son score.
 */
import { useCallback, useEffect, useReducer, useRef } from "react"
import { io, type Socket } from "socket.io-client"
import { socketEndpoint } from "@/lib/socket"
import { initialLiveView, liveErrorCode, liveReducer, type LiveView } from "@/lib/streamerLive"
import type { StreamerState } from "@/lib/types"

const KEY_PREFIX = "blindz_live_key:"
export const PSEUDO_STORAGE = "blindz_live_pseudo"

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Navigation privee ou stockage bloque : on rejouera sans reprise.
  }
}

const STATE_EVENTS = ["state:sync", "round:start", "round:reveal:partial", "round:reveal:final"] as const

export interface LiveSocket {
  view: LiveView
  join: (code: string, pseudo: string) => void
  answer: (title: string, artist: string) => void
  leave: () => void
}

export function useLiveSocket(): LiveSocket {
  const [view, dispatch] = useReducer(liveReducer, initialLiveView)
  const socketRef = useRef<Socket | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view

  const close = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
  }, [])

  const join = useCallback((code: string, pseudo: string) => {
    close()
    dispatch({ type: "connect", roomCode: code })
    writeStorage(PSEUDO_STORAGE, pseudo)
    const { origin, path } = socketEndpoint()
    const socket = io(origin, {
      path,
      withCredentials: false,
      transports: ["polling", "websocket"],
      // Relue a chaque (re)connexion : apres une coupure, la cle recue entre-temps
      // fait revenir le meme viewer au lieu d'un « pseudo deja pris ».
      auth: cb => cb({ live: { salle: code, pseudo, cle: readStorage(`${KEY_PREFIX}${code}`) ?? undefined } }),
    })
    socketRef.current = socket
    socket.on("live:init", payload => {
      if (payload?.me?.key) writeStorage(`${KEY_PREFIX}${code}`, payload.me.key)
      dispatch({ type: "init", payload, now: Date.now() })
    })
    for (const event of STATE_EVENTS) {
      socket.on(event, (payload: StreamerState) => dispatch({ type: "state", payload }))
    }
    socket.on("live:ack", payload => dispatch({ type: "ack", payload }))
    socket.on("live:result", payload => dispatch({ type: "result", payload }))
    socket.on("live:error", payload => {
      dispatch({ type: "error", code: liveErrorCode(payload?.code) })
      close()
    })
    socket.on("connect_error", err => {
      const code = liveErrorCode(err?.message)
      // Refus du serveur : definitif, on ferme. Reseau : socket.io reessaie seul.
      dispatch({ type: "error", code })
      if (code !== "reseau") close()
    })
  }, [close])

  const answer = useCallback((title: string, artist: string) => {
    const round = viewRef.current.game?.currentRound ?? 0
    dispatch({ type: "sending", round })
    socketRef.current?.emit("live:guess", { title, artist })
  }, [])

  const leave = useCallback(() => {
    close()
    dispatch({ type: "reset" })
  }, [close])

  // Retour au premier plan (telephone verrouille) : relire l'etat.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && socketRef.current?.connected) socketRef.current.emit("live:sync")
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      close()
    }
  }, [close])

  return { view, join, answer, leave }
}
