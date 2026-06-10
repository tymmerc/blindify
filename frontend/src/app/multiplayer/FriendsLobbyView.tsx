"use client"

import Link from "next/link"
import { Copy, Link2, Send, Sparkles } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { modeAccent } from "@/lib/uiTokens"
import type { LobbyRendererProps, LobbyChatMessage } from "./lobbyTypes"

/* Component-scoped animations matching the validated mockup. */
const lobbyAnimations = `
@keyframes lobby-char-rise {
  from { opacity: 0; transform: translateY(40px); filter: blur(8px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
@keyframes lobby-code-flicker {
  0%, 100%, 92%, 94%, 96% {
    text-shadow:
      0 0 18px #ff2ec8,
      0 0 38px #ff2ec8,
      0 0 80px rgba(255, 46, 200, 0.7),
      0 0 120px rgba(255, 46, 200, 0.4);
  }
  93%, 95% {
    text-shadow:
      0 0 8px #ff2ec8,
      0 0 18px #ff2ec8,
      0 0 28px rgba(255, 46, 200, 0.4);
    opacity: 0.92;
  }
}
@keyframes lobby-pulse-ring {
  0% { transform: scale(0.95); opacity: 0.9; }
  100% { transform: scale(1.4); opacity: 0; }
}
@keyframes lobby-rpm-pulse {
  from { width: 35%; }
  to { width: 95%; }
}
@keyframes lobby-bar-bounce {
  from { transform: scaleY(0.4); }
  to { transform: scaleY(1.1); }
}
@keyframes lobby-breathe {
  0%, 100% {
    box-shadow:
      0 0 30px rgba(255, 234, 0, 0.4),
      inset 0 0 30px rgba(255, 234, 0, 0.08),
      0 0 80px -10px rgba(255, 234, 0, 0.5);
  }
  50% {
    box-shadow:
      0 0 50px rgba(255, 234, 0, 0.65),
      inset 0 0 50px rgba(255, 234, 0, 0.15),
      0 0 120px -10px rgba(255, 234, 0, 0.7);
  }
}
@keyframes lobby-sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes lobby-blink {
  0%, 60% { opacity: 1; }
  70%, 100% { opacity: 0.3; }
}
@keyframes lobby-caret {
  50% { opacity: 0; }
}
@keyframes lobby-msg-in {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes lobby-scan {
  0% { top: -30px; }
  100% { top: 100%; }
}
@keyframes lobby-join-pulse {
  0% { box-shadow: 0 0 0 rgba(255, 46, 200, 0); }
  30% { box-shadow: 0 0 30px rgba(255, 46, 200, 0.7); }
  100% { box-shadow: 0 0 20px rgba(255, 46, 200, 0.4); }
}
`

/* Reusable corner brackets — wraps the panel in arcade frame markers. */
function CornerBrackets({ color = "#ff2ec8", size = 22 }: { color?: string; size?: number }) {
  const common: React.CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    pointerEvents: "none",
    filter: `drop-shadow(0 0 6px ${color})`,
  }
  return (
    <>
      <span aria-hidden style={{ ...common, top: -2, left: -2, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...common, top: -2, right: -2, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...common, bottom: -2, left: -2, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...common, bottom: -2, right: -2, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
    </>
  )
}

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
      {/* Vinyl stage with pulse rings */}
      <div className="relative flex items-center justify-center my-2" style={{ width: 300, height: 300 }}>
        {/* Pulse rings */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            border: "1px solid rgba(255, 46, 200, 0.4)",
            animation: "lobby-pulse-ring 3s ease-out infinite",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            border: "1px solid rgba(0, 247, 255, 0.35)",
            animation: "lobby-pulse-ring 3s ease-out infinite",
            animationDelay: "0.7s",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            border: "1px solid rgba(255, 234, 0, 0.3)",
            animation: "lobby-pulse-ring 3s ease-out infinite",
            animationDelay: "1.4s",
          }}
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
            backgroundImage:
              "radial-gradient(circle at center,#1b1324 0%,#0f0c14 55%,#05030a 100%), repeating-radial-gradient(circle at center,rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 8px)",
            backgroundBlendMode: "screen",
            boxShadow:
              "0 0 40px rgba(255, 46, 200, 0.45), 0 0 80px rgba(255, 46, 200, 0.25), inset 0 0 40px rgba(0, 0, 0, 0.6)",
            transform: `rotate(${angle}deg)`,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          title="Fais tourner le vinyle"
        >
          {/* Inner grooves */}
          <div className="absolute inset-[14%] rounded-full border border-white/[0.1] bg-[radial-gradient(circle_at_center,#0a070f_0%,#0f0a15_65%,#0a070f_100%)]">
            <div className="absolute inset-1 rounded-full border border-[#ff2ec8]/20 bg-[conic-gradient(from_45deg,rgba(255,255,255,0.08),rgba(255,255,255,0)_18%)] opacity-60" />
          </div>
          {/* Pink label */}
          <div
            className="absolute inset-[32%] rounded-full flex items-center justify-center"
            style={{
              background: "radial-gradient(circle at 30% 30%, #ff2ec8, #7a0d5e 70%, #2a0220)",
              boxShadow: "0 0 16px rgba(255, 46, 200, 0.8), inset 0 0 12px rgba(0, 0, 0, 0.5)",
            }}
          >
            <span
              className="font-display text-[0.7rem] tracking-[0.1em] text-white"
              style={{ fontFamily: "var(--font-display)", textShadow: "0 0 6px rgba(0,0,0,0.7)" }}
            >
              SIDE A
            </span>
          </div>
          {/* Center hole */}
          <div
            className="absolute left-1/2 top-1/2 w-3 h-3 rounded-full bg-[#0a0322]"
            style={{
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 0 2px rgba(255, 234, 0, 0.4)",
            }}
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
              background: "linear-gradient(180deg, #ffea00 0%, #ff2ec8 60%, #00f7ff 100%)",
              boxShadow: "0 0 6px #ff2ec8",
              animation: `lobby-bar-bounce 0.6s ease-in-out infinite alternate`,
              animationDelay: `${(i % 6) * 0.1}s`,
              transformOrigin: "bottom",
            }}
          />
        ))}
      </div>

      {/* RPM block */}
      <div className="text-center font-mono w-full max-w-[240px]">
        <div className="font-mono text-[0.65rem] uppercase tracking-[0.4em] text-[#8b7fb0]">// RPM</div>
        <div
          className="font-display text-[2.2rem] leading-none mt-1 text-[#ffea00]"
          style={{
            fontFamily: "var(--font-display)",
            textShadow: "0 0 12px #ffea00, 0 0 28px rgba(255, 234, 0, 0.6)",
            letterSpacing: "0.05em",
          }}
        >
          {displayRpm}
        </div>
        <div className="w-full h-1 bg-[rgba(255,234,0,0.1)] mt-3 relative overflow-hidden">
          <div
            className="absolute inset-0 transition-[width] duration-300"
            style={{
              width: `${barWidth}%`,
              background: "linear-gradient(90deg, #ff2ec8 0%, #ffea00 100%)",
              boxShadow: "0 0 12px #ffea00",
              animation: rpm < 1 ? "lobby-rpm-pulse 1.2s ease-in-out infinite alternate" : undefined,
            }}
          />
        </div>
        <div
          className="text-[0.62rem] tracking-[0.25em] text-[#00f7ff] mt-2 uppercase opacity-70"
          style={{ textShadow: "0 0 6px #00f7ff" }}
        >
          DRAG_TO_SPIN_FASTER
        </div>
        {highScore > 50 && (
          <p className="text-[10px] text-white/25 mt-1 font-mono tracking-[0.15em]">
            REC : {Math.round(highScore)} RPM
          </p>
        )}
      </div>
    </div>
  )
}

/* ─── Chat component (terminal feel with scanlines and color-coded messages) ─── */
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

  // Color-code each non-me sender by hashing user_id to one of [host=yellow, cyan, pink, purple]
  const senderColor = (userId: number, isHost: boolean): string => {
    if (isHost) return "#ffea00"
    const palette = ["#00f7ff", "#ff2ec8", "#a855f7"]
    return palette[Math.abs(userId) % palette.length]
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
  }

  return (
    <div
      className="relative flex flex-col overflow-hidden h-full min-h-[360px]"
      style={{
        background: "linear-gradient(180deg, rgba(17, 7, 53, 0.85) 0%, rgba(10, 3, 34, 0.85) 100%)",
        border: "1px solid rgba(0, 247, 255, 0.3)",
        backdropFilter: "blur(8px)",
        boxShadow:
          "0 0 0 1px rgba(0, 247, 255, 0.05), 0 30px 80px -20px rgba(0, 247, 255, 0.18), inset 0 0 60px rgba(0, 247, 255, 0.04)",
      }}
    >
      <CornerBrackets color="#00f7ff" size={22} />

      {/* Scanline overlays */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none z-[1] mix-blend-screen"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(0, 247, 255, 0.04) 0, rgba(0, 247, 255, 0.04) 1px, transparent 1px, transparent 3px)",
        }}
      />
      <div
        aria-hidden
        className="absolute left-0 right-0 h-[30px] pointer-events-none z-[2]"
        style={{
          background: "linear-gradient(180deg, rgba(0, 247, 255, 0.15) 0%, transparent 100%)",
          top: "-30px",
          animation: "lobby-scan 5s linear infinite",
        }}
      />

      {/* Header */}
      <div className="px-5 py-4 border-b border-[#00f7ff]/20 flex items-center justify-between relative z-[3]">
        <p
          className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-[#00f7ff] m-0"
          style={{ textShadow: "0 0 8px rgba(0, 247, 255, 0.6)" }}
        >
          <span className="text-[#8b7fb0]">[</span> LOBBY_CHAT <span className="text-[#8b7fb0]">]</span>
        </p>
        <span
          className="font-mono text-[0.62rem] tracking-[0.2em] text-[#ffea00]"
          style={{ textShadow: "0 0 6px #ffea00" }}
        >
          ON
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 relative z-[3] min-h-[280px]"
        style={{ scrollbarWidth: "thin" }}
      >
        {messages.length === 0 && (
          <p className="text-center text-[0.7rem] italic text-[#8b7fb0] py-6 font-mono">
            // CHANNEL OPEN — waiting for transmission
          </p>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.userId === currentUserId
          const color = senderColor(msg.userId, isMe)
          return (
            <div
              key={`${msg.timestamp}-${i}`}
              className="font-mono text-[0.78rem] leading-[1.4]"
              style={{
                animation: "lobby-msg-in 0.4s ease-out backwards",
                animationDelay: `${Math.min(i * 0.05, 0.5)}s`,
              }}
            >
              <span className="text-[#8b7fb0] text-[0.65rem] mr-2 opacity-70">
                {formatTime(msg.timestamp)}
              </span>
              <span
                className="font-bold tracking-[0.1em] mr-1.5"
                style={{ color, textShadow: `0 0 6px ${color}` }}
              >
                <span className="opacity-50">[</span>
                {msg.username || `U${msg.userId}`}
                <span className="opacity-50">]</span>
              </span>
              <span className="text-[#ddd2ff]">{msg.message}</span>
            </div>
          )
        })}
      </div>

      {/* Input row */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-4 py-3 border-t border-[#00f7ff]/20 relative z-[3]"
        style={{ background: "rgba(6, 0, 24, 0.6)" }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="> dis quelque chose..."
          maxLength={200}
          className="flex-1 outline-none font-mono text-[0.78rem] tracking-[0.05em] py-2.5 px-3 text-[#f5e8ff] placeholder:text-[#8b7fb0] focus:shadow-[0_0_12px_rgba(0,247,255,0.3)]"
          style={{
            background: "rgba(0, 247, 255, 0.04)",
            border: "1px solid rgba(0, 247, 255, 0.25)",
          }}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="font-display text-[0.78rem] tracking-[0.15em] px-3 py-2.5 cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          style={{
            fontFamily: "var(--font-display)",
            color: "#ff2ec8",
            background: "rgba(255, 46, 200, 0.1)",
            border: "1px solid #ff2ec8",
            textShadow: "0 0 6px #ff2ec8",
            boxShadow: "0 0 10px rgba(255, 46, 200, 0.3)",
          }}
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
  const accent = modeAccent("friends")
  return (
    <div className="mx-auto max-w-md space-y-6 py-10 text-center">
      <h2 className="text-3xl font-semibold text-white">Partie entre amis</h2>
      <p className="text-sm text-white/50">Cree une room ou rejoins-en une avec un code.</p>
      <div className="grid gap-3">
        <Button
          variant="outline"
          onClick={onHost}
          className="w-full justify-center gap-2 rounded-xl border px-5 py-3.5 text-sm font-semibold"
          style={{ borderColor: accent, color: accent }}
        >
          <Sparkles className="h-4 w-4" />
          Creer une partie
        </Button>
        <form onSubmit={onJoinSubmit} className="flex gap-2">
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            className="flex-1 rounded-xl border border-white/[0.08] bg-[rgba(10,0,20,0.9)] px-4 py-3 text-sm uppercase tracking-[0.25em] text-white outline-none focus:border-pink-500/40"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={joining}
            className="rounded-xl border px-5 py-3 text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: accent, color: accent }}
          >
            Rejoindre
          </Button>
        </form>
      </div>
      <Link href="/friends" className="text-xs text-white/40 hover:text-white/60">
        Retour
      </Link>
    </div>
  )
}

/* ─── Player slot (fighter-select card) ─── */
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

  const accentColor = isHost ? "#ffea00" : isJoined ? "#ff2ec8" : "rgba(168, 85, 247, 0.4)"
  const tagText = isHost
    ? `P${index} // ADMIN`
    : isJoined
      ? `P${index} // JOINED`
      : `P${index} // OPEN`
  const badgeText = isEmpty ? "--/--" : "READY"
  const displayName = isEmpty ? "WAITING" : username || `Player ${index}`

  const slotStyle: React.CSSProperties = {
    background: isHost
      ? "linear-gradient(135deg, rgba(255, 234, 0, 0.12) 0%, rgba(10, 3, 34, 0.7) 60%)"
      : isJoined
        ? "linear-gradient(135deg, rgba(255, 46, 200, 0.1) 0%, rgba(10, 3, 34, 0.6) 60%)"
        : "rgba(168, 85, 247, 0.04)",
    border: isEmpty
      ? "1px dashed rgba(168, 85, 247, 0.35)"
      : `1px solid ${accentColor}`,
    boxShadow: isHost
      ? "0 0 20px rgba(255, 234, 0, 0.25), inset 0 0 30px rgba(255, 234, 0, 0.06)"
      : isJoined
        ? "0 0 20px rgba(255, 46, 200, 0.45)"
        : "none",
    clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
    animation: isJoined ? "lobby-join-pulse 2s ease-out" : undefined,
  }

  const avatarStyle: React.CSSProperties = isEmpty
    ? {
        border: "2px dashed rgba(168, 85, 247, 0.4)",
        background: "rgba(168, 85, 247, 0.06)",
      }
    : {
        border: `2px solid ${accentColor}`,
        boxShadow: isHost
          ? "0 0 18px rgba(255, 234, 0, 0.65), inset 0 0 8px rgba(0, 0, 0, 0.6)"
          : isJoined
            ? "0 0 18px rgba(255, 46, 200, 0.7)"
            : "0 0 14px rgba(0, 247, 255, 0.6), inset 0 0 8px rgba(0, 0, 0, 0.6)",
      }

  const initial = isEmpty ? "?" : (username?.charAt(0).toUpperCase() || "P")

  return (
    <div
      className="relative flex items-center gap-3 px-4 py-3 transition-transform hover:-translate-y-0.5"
      style={slotStyle}
    >
      {isHost && (
        <span
          className="absolute -top-2.5 left-2.5 font-display text-[0.62rem] tracking-[0.2em] px-2 py-0.5 text-[#1a0838]"
          style={{
            fontFamily: "var(--font-display)",
            background: "#ffea00",
            boxShadow: "0 0 12px rgba(255, 234, 0, 0.7)",
            clipPath: "polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)",
          }}
        >
          HOST
        </span>
      )}

      {/* Avatar with neon ring */}
      <div
        className="relative w-[54px] h-[54px] rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center font-display text-xl"
        style={{
          ...avatarStyle,
          background: isEmpty ? avatarStyle.background : "#1a0838",
          color: isEmpty ? "rgba(168, 85, 247, 0.5)" : "#fff",
          fontFamily: "var(--font-display)",
        }}
      >
        {initial}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div
          className="font-mono text-[0.6rem] uppercase tracking-[0.3em] mb-1"
          style={{
            color: isEmpty ? "rgba(168, 85, 247, 0.7)" : accentColor,
            textShadow: isEmpty ? "none" : `0 0 6px ${accentColor}`,
          }}
        >
          {tagText}
        </div>
        <div
          className="font-display text-base tracking-[0.04em] whitespace-nowrap overflow-hidden text-ellipsis"
          style={{
            fontFamily: "var(--font-display)",
            color: isEmpty ? "rgba(168, 85, 247, 0.55)" : "#f5e8ff",
            textShadow: isEmpty ? "none" : "0 0 6px rgba(255, 255, 255, 0.25)",
          }}
        >
          {displayName}
          {isEmpty && (
            <span
              className="inline-block w-2 h-[14px] ml-0.5 align-middle"
              style={{
                background: "rgba(168, 85, 247, 0.6)",
                animation: "lobby-caret 1s steps(2) infinite",
              }}
            />
          )}
        </div>
      </div>

      {/* Badge */}
      <div
        className="font-mono text-[0.62rem] tracking-[0.2em] px-2 py-1 flex-shrink-0"
        style={{
          border: `1px solid ${isEmpty ? "rgba(168, 85, 247, 0.6)" : accentColor}`,
          color: isEmpty ? "rgba(168, 85, 247, 0.6)" : accentColor,
          background: isHost
            ? "rgba(255, 234, 0, 0.08)"
            : isJoined
              ? "rgba(255, 46, 200, 0.08)"
              : "transparent",
        }}
      >
        {badgeText}
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
}: LobbyRendererProps) {
  const accent = modeAccent("friends")
  const roomCode = room?.room_code ?? ""
  const hostUserId = room?.host_user_id ?? null
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const playerCount = participants.length

  const copyCode = () => {
    if (!roomCode) return
    navigator.clipboard?.writeText(roomCode).catch(() => {})
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const copyLink = () => {
    if (!roomCode) return
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    navigator.clipboard?.writeText(`${origin}/blindify/friends/?join=${roomCode}`).catch(() => {})
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  // Build slots: every participant + empty slots to fill up to 4 total (min 2 visible).
  const totalSlots = Math.max(2, Math.min(4, playerCount + 1))
  const emptySlots = Math.max(0, totalSlots - playerCount)
  const readyCount = playerCount

  // Press Start label preserves existing logic semantics
  const pressStartLabel = !isHost
    ? "// EN ATTENTE..."
    : importing
      ? "// IMPORT..."
      : starting
        ? "// BOOT..."
        : "> PRESS START"

  return (
    <section className="mx-auto max-w-[1480px] px-4 sm:px-6 pb-16">
      {/* Inline keyframes used by this component */}
      <style jsx global>{lobbyAnimations}</style>

      {/* Lobby header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="font-display leading-none uppercase"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.6rem, 4vw, 2.6rem)",
              letterSpacing: "0.04em",
              color: "#f5e8ff",
              textShadow: "0 0 12px rgba(255, 46, 200, 0.8), 0 0 32px rgba(255, 46, 200, 0.4)",
            }}
          >
            SELECT <span style={{ color: "#00f7ff", textShadow: "0 0 12px #00f7ff" }}>/</span> YOUR{" "}
            <span style={{ color: "#00f7ff", textShadow: "0 0 12px #00f7ff" }}>/</span> CREW
          </h1>
          <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.3em] text-[#8b7fb0]">
            // WAITING FOR HOST INPUT _
          </p>
        </div>
      </div>

      <div className="grid gap-7 lg:grid-cols-[1fr_380px]">

        {/* ─── Left: Main content ─── */}
        <div className="space-y-6">

          {/* ROOM CODE hero panel */}
          <section
            className="relative px-7 py-7"
            style={{
              background:
                "radial-gradient(ellipse 80% 100% at 50% 0%, rgba(255, 46, 200, 0.22) 0%, transparent 60%), linear-gradient(180deg, rgba(17, 7, 53, 0.88) 0%, rgba(10, 3, 34, 0.92) 100%)",
              border: "1px solid rgba(255, 46, 200, 0.45)",
              backdropFilter: "blur(8px)",
              boxShadow:
                "0 0 50px -10px rgba(255, 46, 200, 0.35), inset 0 0 80px rgba(255, 46, 200, 0.08)",
            }}
          >
            <CornerBrackets color="#ff2ec8" size={28} />

            {/* Head */}
            <div className="flex items-center justify-between mb-3">
              <p
                className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-[#ff2ec8] m-0"
                style={{ textShadow: "0 0 8px #ff2ec8" }}
              >
                <span className="text-[#8b7fb0]">[</span> ROOM_CODE <span className="text-[#8b7fb0]">]</span>
              </p>
              <span
                className="font-mono text-[0.62rem] tracking-[0.25em] text-[#00f7ff] px-2.5 py-1"
                style={{
                  border: "1px solid rgba(0, 247, 255, 0.4)",
                  background: "rgba(0, 247, 255, 0.06)",
                  animation: "lobby-blink 1.6s steps(2) infinite",
                }}
              >
                SHARE_TO_INVITE
              </span>
            </div>

            {/* Massive flickering room code */}
            <div
              className="font-display text-center my-2"
              aria-label={`Room code ${roomCode}`}
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2.8rem, 8vw, 5.5rem)",
                letterSpacing: "0.18em",
                lineHeight: 1,
                color: "#ffe7f8",
                animation: "lobby-code-flicker 4.5s infinite",
              }}
            >
              {roomCode.split("").map((char, i) => (
                <span
                  key={`${char}-${i}`}
                  className="inline-block"
                  style={{
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
                className="relative font-display tracking-[0.16em] uppercase cursor-pointer transition-all hover:-translate-y-px"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.85rem",
                  padding: "12px 24px",
                  background: "rgba(255, 46, 200, 0.06)",
                  border: "1px solid #ff2ec8",
                  color: "#ff2ec8",
                  textShadow: "0 0 8px #ff2ec8",
                  boxShadow:
                    "0 0 0 1px rgba(255, 46, 200, 0.15) inset, 0 0 14px rgba(255, 46, 200, 0.25)",
                  clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)",
                }}
              >
                <Copy size={13} className="inline mr-2 -mt-0.5" />
                {copiedCode ? "[ OK ]" : "CODE"}
              </button>
              <button
                type="button"
                onClick={copyLink}
                className="relative font-display tracking-[0.16em] uppercase cursor-pointer transition-all hover:-translate-y-px"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.85rem",
                  padding: "12px 24px",
                  background: "rgba(0, 247, 255, 0.05)",
                  border: "1px solid #00f7ff",
                  color: "#00f7ff",
                  textShadow: "0 0 8px #00f7ff",
                  boxShadow:
                    "0 0 0 1px rgba(0, 247, 255, 0.1) inset, 0 0 14px rgba(0, 247, 255, 0.2)",
                  clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)",
                }}
              >
                <Link2 size={13} className="inline mr-2 -mt-0.5" />
                {copiedLink ? "[ OK ]" : "LIEN"}
              </button>
            </div>
          </section>

          {/* Vinyl + Players grid */}
          <div className="grid gap-6 md:grid-cols-[340px_1fr] items-stretch">

            {/* Vinyl panel */}
            <section
              className="relative flex flex-col items-center justify-between px-6 py-6"
              style={{
                background:
                  "linear-gradient(180deg, rgba(17, 7, 53, 0.85) 0%, rgba(10, 3, 34, 0.85) 100%)",
                border: "1px solid rgba(255, 46, 200, 0.25)",
                backdropFilter: "blur(8px)",
                boxShadow:
                  "0 0 0 1px rgba(0, 247, 255, 0.05), 0 30px 80px -20px rgba(255, 46, 200, 0.25), inset 0 0 60px rgba(255, 46, 200, 0.05)",
              }}
            >
              <CornerBrackets color="#ff2ec8" size={22} />

              <div
                className="self-start font-mono text-[0.7rem] uppercase tracking-[0.3em] text-[#00f7ff] mb-2"
                style={{ textShadow: "0 0 8px rgba(0, 247, 255, 0.6)" }}
              >
                <span className="text-[#8b7fb0]">[</span> FIDGET_DECK <span className="text-[#8b7fb0]">]</span>
              </div>

              <SpinVinyl accent={accent} />
            </section>

            {/* Players panel */}
            <section
              className="relative px-6 py-6"
              style={{
                background:
                  "linear-gradient(180deg, rgba(17, 7, 53, 0.85) 0%, rgba(10, 3, 34, 0.85) 100%)",
                border: "1px solid rgba(255, 46, 200, 0.25)",
                backdropFilter: "blur(8px)",
                boxShadow:
                  "0 0 0 1px rgba(0, 247, 255, 0.05), 0 30px 80px -20px rgba(255, 46, 200, 0.25), inset 0 0 60px rgba(255, 46, 200, 0.05)",
              }}
            >
              <CornerBrackets color="#ff2ec8" size={22} />

              {/* Players head */}
              <div className="flex items-center justify-between mb-5">
                <p
                  className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-[#00f7ff] m-0"
                  style={{ textShadow: "0 0 8px rgba(0, 247, 255, 0.6)" }}
                >
                  <span className="text-[#8b7fb0]">[</span> ROSTER <span className="text-[#8b7fb0]">]</span>
                </p>
                <span
                  className="font-mono text-[0.7rem] tracking-[0.25em] text-[#ff2ec8]"
                  style={{ textShadow: "0 0 6px #ff2ec8" }}
                >
                  CREW{" "}
                  <strong
                    className="font-display text-base text-[#f5e8ff] mx-1"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {playerCount.toString().padStart(2, "0")}
                  </strong>
                  /04
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
              className="relative w-full max-w-[720px] overflow-hidden font-display uppercase text-center cursor-pointer transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.2rem, 2.6vw, 2rem)",
                letterSpacing: "0.18em",
                padding: "22px 40px",
                background:
                  "linear-gradient(180deg, rgba(255, 234, 0, 0.08) 0%, rgba(255, 234, 0, 0.02) 100%)",
                border: "2px solid #ffea00",
                color: "#ffea00",
                textShadow: "0 0 14px #ffea00, 0 0 30px rgba(255, 234, 0, 0.7)",
                animation: canStart && !starting ? "lobby-breathe 2s ease-in-out infinite" : undefined,
                clipPath: "polygon(20px 0, 100% 0, calc(100% - 20px) 100%, 0 100%)",
              }}
            >
              {/* Sweep overlay */}
              {canStart && !starting && (
                <span
                  aria-hidden
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(255, 234, 0, 0.18) 50%, transparent 100%)",
                    transform: "translateX(-100%)",
                    animation: "lobby-sweep 3s ease-in-out infinite",
                  }}
                />
              )}
              <span className="relative z-[1]">{pressStartLabel}</span>
            </button>

            <div className="font-mono text-[0.72rem] tracking-[0.3em] uppercase text-[#8b7fb0]">
              //{" "}
              <span
                className="text-[#00f7ff]"
                style={{ textShadow: "0 0 6px #00f7ff" }}
              >
                {readyCount} PLAYERS READY
              </span>{" "}
              — {isHost ? "HOST CAN LAUNCH _" : "WAITING FOR HOST _"}
            </div>

            {!canStart && isHost && playerCount < 2 && (
              <p className="text-center font-mono text-[0.7rem] tracking-[0.15em] text-white/30">
                // BESOIN DE 2 JOUEURS MINIMUM
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
            <div
              className="relative px-6 py-12 text-center font-mono text-[0.78rem] tracking-[0.15em] text-white/20"
              style={{
                background: "rgba(15, 5, 30, 0.85)",
                border: "1px solid rgba(0, 247, 255, 0.2)",
              }}
            >
              <CornerBrackets color="#00f7ff" size={22} />
              CHAT INDISPONIBLE
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
