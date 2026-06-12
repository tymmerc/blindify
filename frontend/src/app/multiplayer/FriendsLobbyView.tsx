"use client"

import Link from "next/link"
import { Copy, Link2, Send, Sparkles } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { modeAccent } from "@/lib/uiTokens"
import type { LobbyRendererProps, LobbyChatMessage } from "./lobbyTypes"
import { ProfileImportBlock } from "@/components/import/ProfileImportBlock"

/* Component-scoped animations matching the analog mockup. */
const lobbyAnimations = `
@keyframes lobby-char-rise {
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes lobby-rpm-pulse {
  from { width: 35%; }
  to { width: 95%; }
}
@keyframes lobby-bar-bounce {
  from { transform: scaleY(0.4); }
  to { transform: scaleY(1.1); }
}
@keyframes lobby-caret {
  50% { opacity: 0; }
}
@keyframes lobby-msg-in {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}
`

const VINYL_GROOVES = "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)"

/* ─── Interactive Vinyl: drag to spin ─── */
function SpinVinyl({ accent }: { accent: string }) {
  const [rpm, setRpm] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [angle, setAngle] = useState(0)
  const dragging = useRef(false)
  const lastAngle = useRef(0)
  const velocity = useRef(0)
  const lastTime = useRef(0)
  const discRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const decayRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Spin decay
  useEffect(() => {
    decayRef.current = setInterval(() => {
      if (!dragging.current) {
        setRpm(prev => {
          const next = Math.max(0, prev * 0.97 - 0.5)
          return next < 0.5 ? 0 : next
        })
      }
    }, 50)
    return () => { if (decayRef.current) clearInterval(decayRef.current) }
  }, [])

  // Continuous rotation from RPM
  useEffect(() => {
    let last = performance.now()
    function tick(now: number) {
      if (!dragging.current) {
        const dt = (now - last) / 1000
        setAngle(prev => prev + rpm * 6 * dt) // 6 deg per RPM per sec
      }
      last = now
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [rpm])

  const getMouseAngle = useCallback((e: MouseEvent | TouchEvent) => {
    const el = discRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI)
  }, [])

  const onDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    dragging.current = true
    const a = getMouseAngle(e.nativeEvent)
    lastAngle.current = a
    velocity.current = 0
    lastTime.current = performance.now()
  }, [getMouseAngle])

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return
      const a = getMouseAngle(e)
      let delta = a - lastAngle.current
      if (delta > 180) delta -= 360
      if (delta < -180) delta += 360
      setAngle(prev => prev + delta)
      const now = performance.now()
      const dt = now - lastTime.current
      if (dt > 0) velocity.current = delta / dt * 16
      lastTime.current = now
      lastAngle.current = a
      setRpm(prev => {
        const next = Math.min(Math.abs(velocity.current) * 3, 500)
        if (next > highScore) setHighScore(next)
        return Math.max(prev, next)
      })
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      setRpm(Math.min(Math.abs(velocity.current) * 3, 500))
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    window.addEventListener("touchmove", onMove, { passive: false })
    window.addEventListener("touchend", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onUp)
    }
  }, [getMouseAngle, highScore])

  const handleClick = useCallback(() => {
    setRpm(prev => Math.min(prev + 20, 500))
  }, [])

  const displayRpm = Math.round(rpm) || 120
  const barWidth = Math.max(30, Math.min(95, 35 + (rpm / 500) * 60))

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Vinyl stage on its platter */}
      <div className="relative flex items-center justify-center my-2" style={{ width: 300, height: 300 }}>
        {/* Platter outer ring */}
        <div
          aria-hidden
          className="absolute -inset-3 rounded-full border-2 border-[rgba(46,32,20,.3)] pointer-events-none"
        />

        {/* Vinyl disc (interactive) */}
        <div
          ref={discRef}
          onMouseDown={onDown}
          onTouchStart={onDown}
          onClick={handleClick}
          className="relative outline-none select-none cursor-grab active:cursor-grabbing rounded-full"
          style={{
            width: 280,
            height: 280,
            background: VINYL_GROOVES,
            border: "3px solid #2e2014",
            transform: `rotate(${angle}deg)`,
          }}
          title="Fais tourner le vinyle"
        >
          {/* Terracotta label */}
          <div
            className="absolute inset-[32%] rounded-full flex items-center justify-center border-[3px] border-[#2e2014] bg-[#c65133]"
          >
            <span className="font-display text-[0.7rem] font-semibold tracking-[0.1em] text-[#f4ecdb]">
              SIDE A
            </span>
          </div>
          {/* Center hole */}
          <div
            className="absolute left-1/2 top-1/2 w-3 h-3 rounded-full border-2 border-[#2e2014] bg-[#f4ecdb]"
            style={{ transform: "translate(-50%, -50%)" }}
          />
        </div>
      </div>

      {/* Audio bars */}
      <div className="flex items-end gap-1 h-9 mb-1">
        {[30, 60, 90, 50, 75, 40, 85, 55, 70].map((h, i) => (
          <div
            key={i}
            style={{
              width: 5,
              height: `${h}%`,
              background: i % 2 === 0 ? "#c65133" : "#e0a32e",
              animation: `lobby-bar-bounce 0.6s ease-in-out infinite alternate`,
              animationDelay: `${(i % 6) * 0.1}s`,
              transformOrigin: "bottom",
            }}
          />
        ))}
      </div>

      {/* RPM block */}
      <div className="text-center w-full max-w-[240px]">
        <div className="text-[11px] font-bold uppercase tracking-[0.4em] text-[#8a7558]">RPM</div>
        <div className="font-display text-[2.2rem] font-bold leading-none mt-1 text-[#2e2014]">
          {displayRpm}
        </div>
        <div className="w-full h-1 bg-[rgba(46,32,20,0.12)] mt-3 relative overflow-hidden rounded-full">
          <div
            className="absolute inset-0 transition-[width] duration-300"
            style={{
              width: `${barWidth}%`,
              background: "linear-gradient(90deg, #c65133 0%, #e0a32e 100%)",
              animation: rpm < 1 ? "lobby-rpm-pulse 1.2s ease-in-out infinite alternate" : undefined,
            }}
          />
        </div>
        <div className="font-display text-xs italic text-[#8a7558] mt-2">
          Fais tourner le disque plus vite.
        </div>
        {highScore > 50 && (
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8a7558] mt-1">
            Record : {Math.round(highScore)} RPM
          </p>
        )}
      </div>
    </div>
  )
}

/* ─── Chat component (paper card with ink dividers) ─── */
function LobbyChat({
  messages,
  onSend,
  currentUserId,
  accent,
}: {
  messages: LobbyChatMessage[]
  onSend: (msg: string) => void
  currentUserId: number
  accent: string
}) {
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    onSend(trimmed)
    setInput("")
  }

  // Color-code each non-me sender by hashing user_id to one of the analog accents
  const senderColor = (userId: number, isHost: boolean): string => {
    if (isHost) return "#c65133"
    const palette = ["#5d7252", "#a87714", "#6b573f"]
    return palette[Math.abs(userId) % palette.length]
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
  }

  return (
    <div className="relative flex h-full min-h-[360px] flex-col overflow-hidden rounded-md border-2 border-[#2e2014] bg-[#ece1c8] shadow-[4px_4px_0_rgba(46,32,20,.18)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-[#2e2014] px-5 py-4">
        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-[#c65133]">
          Lobby · Chat
        </p>
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b573f]">
          <span aria-hidden className="h-2 w-2 rounded-full bg-[#7d9471]" />
          On
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-[280px]"
        style={{ scrollbarWidth: "thin" }}
      >
        {messages.length === 0 && (
          <p className="py-6 text-center font-display text-sm italic text-[#8a7558]">
            Le canal est ouvert. Lance la discussion !
          </p>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.userId === currentUserId
          const color = senderColor(msg.userId, isMe)
          return (
            <div
              key={`${msg.timestamp}-${i}`}
              className="text-[0.82rem] leading-[1.45]"
              style={{
                animation: "lobby-msg-in 0.4s ease-out backwards",
                animationDelay: `${Math.min(i * 0.05, 0.5)}s`,
              }}
            >
              <span className="mr-2 text-[0.65rem] text-[#8a7558]">
                {formatTime(msg.timestamp)}
              </span>
              <span className="mr-1.5 font-bold tracking-[0.04em]" style={{ color }}>
                {msg.username || `U${msg.userId}`}
              </span>
              <span className="text-[#2e2014]">{msg.message}</span>
            </div>
          )
        })}
      </div>

      {/* Input row */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t-2 border-[#2e2014] bg-[#efe5d0] px-4 py-3"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="dis quelque chose..."
          maxLength={200}
          className="flex-1 rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#f4ecdb] px-3 py-2.5 text-[0.82rem] text-[#2e2014] outline-none placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="flex items-center justify-center gap-1 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-3 py-2.5 text-[#f4ecdb] shadow-[2px_2px_0_#2e2014] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Envoyer"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  )
}

/* ─── Landing: fallback if someone navigates directly to /multiplayer?mode=friends ─── */
function FriendsEntry({
  onHost,
  onJoinSubmit,
  joinCode,
  setJoinCode,
  joining,
}: {
  onHost: () => void
  onJoinSubmit: LobbyRendererProps["onJoinSubmit"]
  joinCode: LobbyRendererProps["joinCode"]
  setJoinCode: LobbyRendererProps["setJoinCode"]
  joining: LobbyRendererProps["joining"]
}) {
  return (
    <div className="mx-auto max-w-md space-y-6 py-10 text-center">
      <h2 className="font-display text-3xl font-semibold text-[#2e2014]">Partie entre <em className="font-medium italic text-[#c65133]">amis</em></h2>
      <p className="text-sm text-[#6b573f]">Cree une room ou rejoins-en une avec un code.</p>
      <div className="grid gap-3">
        <Button
          variant="outline"
          onClick={onHost}
          className="w-full justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-3.5 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#c65133] hover:text-[#f4ecdb] hover:shadow-[2px_2px_0_#2e2014]"
        >
          <Sparkles className="h-4 w-4" />
          Creer une partie
        </Button>
        <form onSubmit={onJoinSubmit} className="flex gap-2">
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            className="flex-1 rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.25em] text-[#2e2014] outline-none placeholder:text-[#b3a182] focus:border-[#c65133]"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={joining}
            className="rounded-md border-2 border-[#2e2014] bg-[#2e2014] px-5 py-3 text-sm font-bold text-[#f4ecdb] transition hover:bg-[#1d140b] hover:text-[#f4ecdb] disabled:opacity-50"
          >
            Rejoindre
          </Button>
        </form>
      </div>
      <Link href="/friends" className="text-xs text-[#8a7558] hover:text-[#2e2014]">
        Retour
      </Link>
    </div>
  )
}

/* ─── Player slot (paper presence card) ─── */
type SlotVariant = "host" | "joined" | "empty"

function PlayerSlot({
  index,
  variant,
  username,
}: {
  index: number
  variant: SlotVariant
  username?: string | null
}) {
  const isHost = variant === "host"
  const isEmpty = variant === "empty"
  const isJoined = variant === "joined"

  const tagText = isHost
    ? `P${index} · Hote`
    : isJoined
      ? `P${index} · Connecte`
      : `P${index} · Libre`
  const displayName = isEmpty ? "En attente" : username || `Joueur ${index}`

  const slotStyle: React.CSSProperties = {
    background: isEmpty ? "transparent" : "#f4ecdb",
    border: isEmpty
      ? "2px dashed rgba(46,32,20,.35)"
      : isHost
        ? "2px solid #c65133"
        : "2px solid #2e2014",
    boxShadow: isEmpty ? "none" : "3px 3px 0 rgba(46,32,20,.18)",
    borderRadius: 6,
  }

  const avatarStyle: React.CSSProperties = isEmpty
    ? {
        border: "2px dashed rgba(46,32,20,.35)",
        background: "transparent",
        color: "#b3a182",
      }
    : {
        border: "2px solid #2e2014",
        background: isHost ? "#c65133" : "#f4ecdb",
        color: isHost ? "#f4ecdb" : "#2e2014",
      }

  const initial = isEmpty ? "?" : (username?.charAt(0).toUpperCase() || "P")

  return (
    <div
      className="relative flex items-center gap-3 px-4 py-3 transition-transform hover:-translate-y-0.5"
      style={slotStyle}
    >
      {isHost && (
        <span className="absolute -top-2.5 left-2.5 rounded-full border-[1.5px] border-[#2e2014] bg-[#c65133] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f4ecdb]">
          Hote
        </span>
      )}

      {/* Avatar */}
      <div
        className="relative flex h-[54px] w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-xl font-semibold"
        style={avatarStyle}
      >
        {initial}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div
          className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: isEmpty ? "#b3a182" : isHost ? "#c65133" : "#8a7558" }}
        >
          {tagText}
        </div>
        <div
          className="overflow-hidden text-ellipsis whitespace-nowrap font-display text-base font-semibold"
          style={{ color: isEmpty ? "#b3a182" : "#2e2014" }}
        >
          {displayName}
          {isEmpty && (
            <span
              className="inline-block w-2 h-[14px] ml-0.5 align-middle"
              style={{
                background: "rgba(46,32,20,.35)",
                animation: "lobby-caret 1s steps(2) infinite",
              }}
            />
          )}
        </div>
      </div>

      {/* Status pill */}
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-[rgba(46,32,20,.35)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b573f]">
        {!isEmpty && <span aria-hidden className="h-2 w-2 rounded-full bg-[#7d9471]" />}
        {isEmpty ? "Libre" : "En ligne"}
      </div>
    </div>
  )
}

/* ─── Lobby ─── */
function FriendsLobby({
  participants,
  onStart,
  starting,
  canStart,
  isHost,
  room,
  importing,
  currentUserId,
  chatMessages = [],
  onSendChat,
  initialProfileUrl,
  onImportingChange,
}: LobbyRendererProps) {
  const accent = modeAccent("friends")
  const roomCode = room?.room_code ?? ""
  const hostUserId = room?.host_user_id ?? null
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const playerCount = participants.length

  // N'affiche "Copié !" QUE si la copie a vraiment réussi (contexte non
  // sécurisé / permission refusée => on prévient au lieu de mentir).
  const [copyError, setCopyError] = useState(false)
  const doCopy = async (text: string, setOk: (v: boolean) => void) => {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard")
      await navigator.clipboard.writeText(text)
      setOk(true)
      setCopyError(false)
      setTimeout(() => setOk(false), 2000)
    } catch {
      setCopyError(true)
      setTimeout(() => setCopyError(false), 3000)
    }
  }
  const copyCode = () => { if (roomCode) void doCopy(roomCode, setCopiedCode) }
  const copyLink = () => {
    if (!roomCode) return
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    void doCopy(`${origin}/blindify/friends/?join=${roomCode}`, setCopiedLink)
  }

  // Build slots: every participant + empty slots to fill up to 4 total (min 2 visible).
  const totalSlots = Math.max(2, Math.min(4, playerCount + 1))
  const emptySlots = Math.max(0, totalSlots - playerCount)
  const readyCount = playerCount

  // Press Start label preserves existing logic semantics
  const pressStartLabel = !isHost
    ? "En attente du host..."
    : importing
      ? "Import..."
      : starting
        ? "Lancement..."
        : "Lancer la partie"

  return (
    <section className="mx-auto max-w-[1480px] px-4 sm:px-6 pb-16 text-[#2e2014]">
      {/* Inline keyframes used by this component */}
      <style jsx global>{lobbyAnimations}</style>

      {/* Lobby header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="font-display font-semibold leading-none text-[#2e2014]"
            style={{ fontSize: "clamp(1.6rem, 4vw, 2.6rem)", letterSpacing: "-0.01em" }}
          >
            Rassemble ton <em className="font-medium italic text-[#c65133]">equipage</em>
          </h1>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
            En attente des joueurs
          </p>
        </div>
      </div>

      <div className="grid gap-7 lg:grid-cols-[1fr_380px]">

        {/* ─── Left: Main content ─── */}
        <div className="space-y-6">

          {/* ROOM CODE hero panel */}
          <section className="relative rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-7 py-7 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
            {/* Head */}
            <div className="flex items-center justify-between mb-3">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-[#c65133]">
                Salle · Code
              </p>
              <span className="rounded-full border-[1.5px] border-[#2e2014] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
                Partage pour inviter
              </span>
            </div>

            {/* Big framed room code */}
            <div
              className="my-4 flex flex-wrap items-center justify-center gap-2"
              aria-label={`Room code ${roomCode}`}
            >
              {roomCode.split("").map((char, i) => (
                <span
                  key={`${char}-${i}`}
                  className="inline-flex items-center justify-center rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-2 py-1 font-display font-bold leading-none text-[#2e2014] shadow-[3px_3px_0_rgba(46,32,20,.18)] sm:px-3"
                  style={{
                    // 8.5vw sur mobile : les 6 tuiles doivent tenir sur UNE ligne en 390px
                    fontSize: "clamp(1.5rem, 8.5vw, 4rem)",
                    animation: "lobby-char-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards",
                    animationDelay: `${0.05 + i * 0.1}s`,
                  }}
                >
                  {char}
                </span>
              ))}
            </div>

            {/* Share buttons */}
            <div className="flex flex-wrap gap-3 justify-center mt-5">
              <button
                type="button"
                onClick={copyCode}
                className="flex items-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-6 py-3 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
              >
                <Copy size={13} />
                {copiedCode ? "Copie !" : "Copier le code"}
              </button>
              <button
                type="button"
                onClick={copyLink}
                className="flex items-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#2e2014] px-6 py-3 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_rgba(46,32,20,.35)] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgba(46,32,20,.35)]"
              >
                <Link2 size={13} />
                {copiedLink ? "Copie !" : "Copier le lien"}
              </button>
            </div>
            {copyError ? (
              <p className="mt-2 text-[11px] font-bold text-[#9c2f1d]">
                Copie impossible ici — sélectionne le code à la main.
              </p>
            ) : null}
          </section>

          {/* Ta musique : import (consomme l'URL du wizard via autoStart) */}
          <section className="relative rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-6 py-5 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-[#c65133]">
                Ta musique
              </p>
              <span className="rounded-full border-[1.5px] border-[#2e2014] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
                Tes titres dans la partie
              </span>
            </div>
            <p className="mb-3 text-sm text-[#6b573f]">
              Importe ton profil Spotify ou Deezer : la partie piochera dans les morceaux de tout l'equipage.
            </p>
            <ProfileImportBlock
              accent="#c65133"
              initialUrl={initialProfileUrl ?? undefined}
              autoStart={Boolean(initialProfileUrl)}
              onImportingChange={onImportingChange}
            />
          </section>

          {/* Vinyl + Players grid */}
          <div className="grid gap-6 md:grid-cols-[340px_1fr] items-stretch">

            {/* Vinyl panel */}
            <section className="relative flex flex-col items-center justify-between rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-6 py-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
              <div className="self-start mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
                Platine · Fidget
              </div>

              <SpinVinyl accent={accent} />
            </section>

            {/* Players panel */}
            <section className="relative rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-6 py-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
              {/* Players head */}
              <div className="flex items-center justify-between mb-5">
                <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-[#c65133]">
                  Equipage
                </p>
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#6b573f]">
                  <strong className="mx-1 font-display text-base font-bold text-[#2e2014]">
                    {playerCount.toString().padStart(2, "0")}
                  </strong>
                  / 04
                </span>
              </div>

              {/* Grid of slots */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {participants.map((p, i) => {
                  const variant: SlotVariant = p.user_id === hostUserId ? "host" : "joined"
                  return (
                    <PlayerSlot
                      key={p.user_id}
                      index={i + 1}
                      variant={variant}
                      username={p.username}
                    />
                  )
                })}
                {Array.from({ length: emptySlots }).map((_, idx) => (
                  <PlayerSlot
                    key={`empty-${idx}`}
                    index={playerCount + idx + 1}
                    variant="empty"
                  />
                ))}
              </div>
            </section>
          </div>

          {/* Press Start button */}
          <div className="mt-7 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={onStart}
              disabled={starting || !canStart}
              className="relative w-full max-w-[720px] rounded-md border-2 border-[#2e2014] bg-[#c65133] text-center font-display font-bold text-[#f4ecdb] shadow-[6px_6px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[6px_6px_0_#2e2014]"
              style={{
                fontSize: "clamp(1.2rem, 2.6vw, 2rem)",
                letterSpacing: "0.02em",
                padding: "22px 40px",
              }}
            >
              {pressStartLabel}
            </button>

            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
              <span className="text-[#5d7252]">{readyCount} joueurs prets</span>
              {" · "}
              {isHost ? "a toi de lancer" : "en attente du host"}
            </div>

            {!canStart && isHost && playerCount < 2 && (
              <p className="text-center font-display text-xs italic text-[#8a7558]">
                Il faut au moins 2 joueurs pour lancer.
              </p>
            )}
          </div>
        </div>

        {/* ─── Right: Chat ─── */}
        <aside>
          {onSendChat ? (
            <LobbyChat
              messages={chatMessages}
              onSend={onSendChat}
              currentUserId={currentUserId}
              accent={accent}
            />
          ) : (
            <div className="relative rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] px-6 py-12 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
              Chat indisponible
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

export function FriendsLobbyView(props: LobbyRendererProps) {
  if (props.view === "landing") {
    return (
      <FriendsEntry
        onHost={props.onHost}
        onJoinSubmit={props.onJoinSubmit}
        joinCode={props.joinCode}
        setJoinCode={props.setJoinCode}
        joining={props.joining}
      />
    )
  }

  if ((props.view === "hosting" || props.view === "waiting") && props.room) {
    return <FriendsLobby {...props} />
  }

  return null
}
