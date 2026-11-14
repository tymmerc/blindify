"use client"

import { useEffect, useRef, useState } from "react"
import { Send, X } from "lucide-react"
import type { LobbyChatMessage } from "./lobbyTypes"

/* Keyframes embarquees pour que le composant soit autonome (event + friends lobby). */
const chatAnimation = `
@keyframes lobby-msg-in {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}
`

/* ─── Chat de lobby (carte papier, dividers encre) ─── */
export function LobbyChat({
  messages,
  onSend,
  currentUserId,
  accent,
  onClose,
  placeholder = "dis quelque chose...",
  emptyLabel = "Le canal est ouvert. Lance la discussion !",
  bare = false,
}: {
  messages: LobbyChatMessage[]
  onSend: (msg: string) => void
  currentUserId: number
  accent?: string
  onClose?: () => void
  placeholder?: string
  emptyLabel?: string
  /** Sans cadre ni en-tete : pour vivre dans le panneau de la bulle du lobby. */
  bare?: boolean
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
  const senderColor = (userId: number, isMe: boolean): string => {
    if (isMe) return "rgb(var(--c-terra-txt))"
    const palette = ["rgb(var(--c-sage-deep-txt))", "rgb(var(--c-gold-deep-txt))", "rgb(var(--c-ink-2))"]
    return palette[Math.abs(userId) % palette.length]
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
  }

  return (
    <div className={bare ? "relative flex h-full min-h-0 flex-col" : "relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-md border-2 border-line bg-paper-deep shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]"}>
      <style>{chatAnimation}</style>
      {/* Header */}
      {!bare && (
      <div className="flex items-center justify-between border-b-2 border-line px-5 py-3.5">
        <p className="m-0 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-ink">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full border-[1.5px] border-line" style={{ background: accent ?? "#c65133" }} />
          Le chat
        </p>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-2">
            <span aria-hidden className="h-2 w-2 rounded-full bg-sage" />
            On
          </span>
          {onClose ? (
            <button type="button" onClick={onClose} aria-label="Fermer le chat" className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-line text-ink transition hover:bg-ink-block hover:text-on-ink">
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className={`flex flex-1 flex-col gap-3 overflow-y-auto ${bare ? "min-h-0 px-4 py-3" : "min-h-[110px] px-5 py-4"}`}
        style={{ scrollbarWidth: "thin" }}
      >
        {messages.length === 0 && (
          <p className="py-6 text-center font-display text-sm italic text-sourd">
            {emptyLabel}
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
              <span className="mr-2 text-[0.65rem] text-sourd">
                {formatTime(msg.timestamp)}
              </span>
              <span className="mr-1.5 font-bold tracking-[0.04em]" style={{ color }}>
                {msg.username || `U${msg.userId}`}
              </span>
              <span className="text-ink">{msg.message}</span>
            </div>
          )
        })}
      </div>

      {/* Input row */}
      <form
        onSubmit={handleSubmit}
        className={`flex shrink-0 items-center gap-2 border-line bg-well px-4 ${bare ? "border-t-[1.5px] pb-4 pt-2" : "border-t-2 py-3"}`}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={placeholder}
          maxLength={200}
          className="flex-1 rounded-md border-[1.5px] border-[rgb(var(--c-line)/.35)] bg-paper px-3 py-2.5 text-[0.82rem] text-ink outline-none placeholder:italic placeholder:text-pale focus:border-terra"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="flex items-center justify-center gap-1 rounded-md border-2 border-line bg-terra px-3 py-2.5 text-on-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Envoyer"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  )
}
