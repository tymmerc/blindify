"use client"

/**
 * Overlay OBS (T5) : socket signe par le lien du lobby, et lecture de
 * l'extrait. C'est l'overlay qui joue le son dans le stream : le streamer met
 * cette source navigateur sur une piste audio exclue de la VOD.
 */
import { useEffect, useReducer, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { socketEndpoint } from "@/lib/socket"
import { initialOverlayView, liveErrorCode, overlayReducer, type OverlayView } from "@/lib/streamerLive"
import type { StreamerState } from "@/lib/types"

const STATE_EVENTS = ["state:sync", "round:start", "round:reveal:partial", "round:reveal:final"] as const

export function useOverlaySocket(salle: string | null, jeton: string | null): OverlayView {
  const [view, dispatch] = useReducer(overlayReducer, initialOverlayView)
  useEffect(() => {
    if (!salle || !jeton) {
      dispatch({ type: "error", code: "lien_incomplet" })
      return
    }
    const { origin, path } = socketEndpoint()
    const socket: Socket = io(origin, {
      path,
      withCredentials: false,
      transports: ["polling", "websocket"],
      auth: { overlay: { salle, jeton } },
    })
    socket.on("overlay:init", payload => dispatch({ type: "init", payload, now: Date.now() }))
    for (const event of STATE_EVENTS) {
      socket.on(event, (payload: StreamerState) => dispatch({ type: "state", payload }))
    }
    socket.on("streamer:viewers", payload => dispatch({ type: "viewers", payload }))
    socket.on("streamer:answers", payload => dispatch({ type: "answers", payload }))
    socket.on("overlay:expired", () => {
      dispatch({ type: "error", code: "overlay_expire" })
      socket.close()
    })
    socket.on("connect_error", err => {
      const code = liveErrorCode(err?.message)
      dispatch({ type: "error", code })
      if (code !== "reseau") socket.close()
    })
    // Reconnexion apres une coupure : relire l'etat complet.
    socket.io.on("reconnect", () => socket.emit("overlay:sync"))
    return () => {
      socket.close()
    }
  }, [salle, jeton])
  return view
}

/** Phases ou l'extrait tourne : de l'ouverture des reponses jusqu'a la manche suivante. */
const PLAYING: ReadonlySet<StreamerState["phase"]> = new Set(["GUESSING_CHAT", "REVEAL_PARTIAL", "GUESSING_STREAMER", "REVEAL_FINAL", "ROUND_ENDED"])

/**
 * Joue l'extrait de la manche. Un seul element audio, reutilise (le
 * deblocage de la lecture auto tient a l'element). Dans OBS la lecture auto
 * est permise ; dans un navigateur, `blocked` demande un clic.
 */
export function useOverlayAudio(game: StreamerState | null): { blocked: boolean; unlock: () => void } {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [blocked, setBlocked] = useState(false)
  const url = game && PLAYING.has(game.phase) ? game.currentTrack?.previewUrl ?? null : null
  const round = game?.currentRound ?? 0

  useEffect(() => {
    if (!audio.current) {
      audio.current = new Audio()
      audio.current.loop = true
    }
    const el = audio.current
    if (!url) {
      el.pause()
      return
    }
    if (el.src !== url) {
      el.src = url
      el.currentTime = 0
    }
    el.play().then(() => setBlocked(false)).catch(() => setBlocked(true))
  }, [url, round])

  useEffect(() => () => audio.current?.pause(), [])

  const unlock = () => {
    const el = audio.current
    if (!el || !el.src) return
    el.play().then(() => setBlocked(false)).catch(() => setBlocked(true))
  }
  return { blocked, unlock }
}
