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
  onClose,
  placeholder = "dis quelque chose...",
  emptyLabel = "Le canal est ouvert. Lance la discussion !",
}: {
  messages: LobbyChatMessage[]
  onSend: (msg: string) => void
  currentUserId: number
  accent?: string
  onClose?: () => void
  placeholder?: string
  emptyLabel?: string
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
    if (isMe) return "#c65133"
    const palette = ["#5d7252", "#a87714", "#6b573f"]
    return palette[Math.abs(userId) % palette.length]
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
  }

  return (
    <div className="relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-md border-2 border-[#2e2014] bg-[#ece1c8] shadow-[4px_4px_0_rgba(46,32,20,.18)]">
      <style>{chatAnimation}</style>
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-[#2e2014] px-5 py-4">
        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-[#c65133]">
          Lobby · Chat
        </p>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b573f]">
            <span aria-hidden className="h-2 w-2 rounded-full bg-[#7d9471]" />
            On
          </span>
          {onClose ? (
            <button type="button" onClick={onClose} aria-label="Fermer le chat" className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-[#2e2014] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]">
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-[110px]"
        style={{ scrollbarWidth: "thin" }}
      >
        {messages.length === 0 && (
          <p className="py-6 text-center font-display text-sm italic text-[#8a7558]">
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
          placeholder={placeholder}
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
