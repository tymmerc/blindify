"use client"

import Link from "next/link"
import { Copy, Link2, Send, Sparkles, Check, MessageCircle, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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

/* ─── Chat component (paper card with ink dividers) ─── */
function LobbyChat({
  messages,
  onSend,
  currentUserId,
  accent,
  onClose,
}: {
  messages: LobbyChatMessage[]
  onSend: (msg: string) => void
  currentUserId: number
  accent: string
  onClose?: () => void
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
    <div className="relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-md border-2 border-[#2e2014] bg-[#ece1c8] shadow-[4px_4px_0_rgba(46,32,20,.18)]">
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
      className={`flex items-center gap-2 px-2.5 py-2 sm:gap-2.5 sm:px-3 ${
        isEmpty ? "" : "animate-in fade-in slide-in-from-bottom-2 duration-500"
      }`}
      style={slotStyle}
    >
      {/* Petite pastille initiale (pas de vraie photo : on ne l'importe pas) */}
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold"
        style={avatarStyle}
      >
        {initial}
      </div>
      {/* Nom */}
      <div
        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-display text-sm font-semibold"
        style={{ color: isEmpty ? "#b3a182" : "#2e2014" }}
      >
        {displayName}
      </div>
      {/* Statut : pastille verte si en ligne, badge texte pour hote/libre */}
      {isJoined ? (
        <span
          aria-label="En ligne"
          title="En ligne"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: "#7d9471" }}
        />
      ) : (
        <span
          className="shrink-0 rounded-full px-1.5 py-0 text-[8px] font-bold uppercase tracking-[0.06em]"
          style={{
            color: isHost ? "#c65133" : "#b3a182",
            border: `1px solid ${isHost ? "#c65133" : "rgba(46,32,20,.3)"}`,
          }}
        >
          {isHost ? "Hôte" : "Libre"}
        </span>
      )}
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

  // Chat mobile : ouverture + compteur de non-lus
  const [chatOpen, setChatOpen] = useState(false)
  const [lastSeenChat, setLastSeenChat] = useState(0)
  useEffect(() => { if (chatOpen) setLastSeenChat(chatMessages.length) }, [chatOpen, chatMessages.length])
  const unreadChat = Math.max(0, chatMessages.length - lastSeenChat)

  // Build slots: every participant + empty slots to fill up to 4 total (min 2 visible).
  const maxPlayers = room?.max_players ?? 8
  const totalSlots = Math.max(2, Math.min(maxPlayers, playerCount + 1))
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

      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_380px] lg:items-stretch">
        <div className="space-y-5">

          {/* ROOM CODE hero panel */}
          <section className="relative rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-4 py-6 sm:px-7 sm:py-7 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
            {/* Head */}
            <div className="mb-2 flex items-center justify-center gap-2 sm:mb-3 sm:justify-between">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-[#c65133]">
                Salle · Code
              </p>
              <span className="hidden rounded-full border-[1.5px] border-[#2e2014] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014] sm:inline-block">
                Partage pour inviter
              </span>
            </div>

            {/* Big framed room code */}
            <div
              className="my-4 flex flex-nowrap items-center justify-center gap-1.5 sm:flex-wrap sm:gap-2"
              aria-label={`Room code ${roomCode}`}
            >
              {roomCode.split("").map((char, i) => (
                <span
                  key={`${char}-${i}`}
                  className="inline-flex items-center justify-center rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-1.5 py-1 font-display font-bold leading-none text-[#2e2014] shadow-[3px_3px_0_rgba(46,32,20,.18)] sm:px-3"
                  style={{
                    // tient sur UNE ligne (6 tuiles) meme en 360px
                    fontSize: "clamp(1.1rem, 6.2vw, 4rem)",
                    animation: "lobby-char-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards",
                    animationDelay: `${0.05 + i * 0.1}s`,
                  }}
                >
                  {char}
                </span>
              ))}
            </div>

            {/* Share buttons */}
            <p className="mb-2 mt-5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a7558] sm:hidden">Partage pour inviter</p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-3">
              <button
                type="button"
                onClick={copyCode}
                className={`flex items-center gap-2 rounded-md border-2 border-[#2e2014] justify-center px-3 py-3 text-[13px] font-bold text-[#f4ecdb] sm:px-6 sm:text-sm shadow-[4px_4px_0_#2e2014] transition-all duration-300 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] ${copiedCode ? "scale-[1.03] bg-[#7d9471]" : "bg-[#c65133]"}`}
              >
                {copiedCode ? (
                  <Check size={14} className="animate-in zoom-in spin-in-45 duration-300" />
                ) : (
                  <Copy size={13} />
                )}
                {copiedCode ? "Copié !" : "Copier code"}
              </button>
              <button
                type="button"
                onClick={copyLink}
                className={`flex items-center gap-2 rounded-md border-2 border-[#2e2014] justify-center px-3 py-3 text-[13px] font-bold text-[#f4ecdb] sm:px-6 sm:text-sm transition-all duration-300 hover:translate-x-[2px] hover:translate-y-[2px] ${copiedLink ? "scale-[1.03] bg-[#7d9471] shadow-[4px_4px_0_#2e2014] hover:shadow-[2px_2px_0_#2e2014]" : "bg-[#2e2014] shadow-[4px_4px_0_rgba(46,32,20,.35)] hover:shadow-[2px_2px_0_rgba(46,32,20,.35)]"}`}
              >
                {copiedLink ? (
                  <Check size={14} className="animate-in zoom-in spin-in-45 duration-300" />
                ) : (
                  <Link2 size={13} />
                )}
                {copiedLink ? "Copié !" : "Copier lien"}
              </button>
            </div>
            {copyError ? (
              <p className="mt-2 text-[11px] font-bold text-[#9c2f1d]">
                Copie impossible ici, sélectionne le code à la main.
              </p>
            ) : null}
          </section>

          {/* Equipage : qui est en ligne */}
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
                  / {maxPlayers.toString().padStart(2, "0")}
                </span>
              </div>

              {/* Grid of slots */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
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

        </div>{/* fin colonne gauche */}

        {/* Colonne droite : le chat etire + Lancer la partie en bas */}
        <aside className="flex flex-col gap-4">
          {onSendChat ? (
            <div className="hidden min-h-[280px] flex-1 lg:block">
              <LobbyChat
                messages={chatMessages}
                onSend={onSendChat}
                currentUserId={currentUserId}
                accent={accent}
              />
            </div>
          ) : null}

          {/* Lancer la partie */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onStart}
              disabled={starting || !canStart}
              className="relative w-full rounded-md border-2 border-[#2e2014] bg-[#c65133] text-center font-display font-bold text-[#f4ecdb] shadow-[6px_6px_0_#2e2014] transition-all duration-150 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_#2e2014] active:translate-x-[4px] active:translate-y-[4px] active:shadow-[2px_2px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[6px_6px_0_#2e2014]"
              style={{ fontSize: "clamp(1.1rem, 2vw, 1.6rem)", letterSpacing: "0.02em", padding: "18px 28px" }}
            >
              {starting && isHost ? (
                <span className="inline-flex items-center gap-0.5">
                  Lancement
                  <span className="inline-flex">
                    <span className="animate-bounce [animation-delay:-0.3s]">.</span>
                    <span className="animate-bounce [animation-delay:-0.15s]">.</span>
                    <span className="animate-bounce">.</span>
                  </span>
                </span>
              ) : (
                pressStartLabel
              )}
            </button>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
              <span className="text-[#5d7252]">{readyCount} joueur(s) prêt(s)</span>
              {" · "}
              {isHost ? "à toi de lancer" : "en attente de l'hôte"}
            </div>
          </div>
        </aside>
      </div>

      {/* Chat mobile : FAB ferme -> s'ouvre EN chat (croix dans le header) (lg:hidden) */}
      {onSendChat ? (
        !chatOpen ? (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            aria-label="Ouvrir le chat"
            className="fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#c65133] text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition active:translate-x-[2px] active:translate-y-[2px] lg:hidden"
          >
            <MessageCircle size={22} />
            {unreadChat > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#7d9471] px-1 text-[10px] font-bold text-[#f4ecdb]">
                {unreadChat > 9 ? "9+" : unreadChat}
              </span>
            ) : null}
          </button>
        ) : (
          <div className="lg:hidden">
            <div className="fixed inset-0 z-40" onClick={() => setChatOpen(false)} />
            <div className="fixed bottom-4 right-4 z-50 h-[min(460px,64vh)] w-[min(300px,82vw)] animate-in fade-in slide-in-from-bottom-4 duration-200">
              <LobbyChat
                messages={chatMessages}
                onSend={onSendChat}
                currentUserId={currentUserId}
                accent={accent}
                onClose={() => setChatOpen(false)}
              />
            </div>
          </div>
        )
      ) : null}
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
