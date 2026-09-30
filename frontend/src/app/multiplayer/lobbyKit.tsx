"use client"

// Briques communes a tous les lobbys (a distance, autour d'une table, streamer).
//
// Refonte du 30/09/2026 : chaque lobby suit la meme ossature, dans cet ordre
// de lecture :
//   1. LA SALLE   bloc de la couleur du mode : code (et QR), partage, qui est la
//   2. LA PARTIE  la regie : reglages + lancer (hote), ou qui lance (invite)
//   3. TA MUSIQUE ce que tu amenes ce soir
//   4. EN ATTENDANT  pierre-feuille-ciseaux et chat
// Sur telephone le bouton Lancer vit dans une barre collee en bas de l'ecran :
// avant, il fallait descendre sous la musique et les reglages pour le trouver.

import { useEffect, useState, type ReactNode } from "react"
import { Check, Copy, Crown, Link2, MessageCircle } from "lucide-react"
import { api } from "@/lib/api"
import type { MultiplayerParticipant, MultiplayerRoom } from "@/lib/types"
import type { LobbyChatMessage } from "./lobbyTypes"
import { LobbyChat } from "./LobbyChat"

export const PAPER = "#f4ecdb"
export const INK = "#2e2014"

/** Cadre sans fond : pour les blocs de couleur, le fond passe par `style`.
 *  Deux classes bg-[...] sur le meme element, c'est l'ordre du CSS genere qui
 *  gagne, pas l'ordre des classes (le bloc de la salle sortait beige). */
export const BLOCK = "rounded-md border-2 border-[#2e2014] shadow-[4px_4px_0_rgba(46,32,20,.18)]"
export const CARD = `${BLOCK} bg-[#ece1c8]`

/** Etiquette de section : texte encre + pastille de couleur. Jamais de petit
 *  texte colore sur papier (contraste insuffisant, regle du brief). */
export function Label({ children, dot, className = "" }: { children: ReactNode; dot: string; className?: string }) {
  return (
    <p className={`m-0 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] ${className}`}>
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-[#2e2014]" style={{ background: dot }} />
      {children}
    </p>
  )
}

export function Panel({
  label,
  dot,
  aside,
  children,
  className = "",
  testId,
}: {
  label?: string
  dot: string
  aside?: ReactNode
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <section className={`${CARD} p-4 text-[#2e2014] sm:p-5 ${className}`} data-testid={testId}>
      {label ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <Label dot={dot}>{label}</Label>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** Le code de la salle en tuiles. `data-code` sert aux scripts E2E : ils le
 *  lisent tel quel au lieu de recoller les tuiles une par une. */
export function RoomCode({ code, size = "lg" }: { code: string; size?: "xl" | "lg" | "md" }) {
  const box = size === "xl" ? "max-w-[24rem]" : size === "lg" ? "max-w-[20rem]" : "max-w-[15rem]"
  // Taille de lettre relative a la LARGEUR DU BLOC (unites cqw), pas de
  // l'ecran : dans l'affiche a cote du QR, 8vw faisait deborder le W.
  const max = size === "xl" ? "3.2rem" : size === "lg" ? "2.5rem" : "1.6rem"
  const font = `clamp(1.1rem, ${Math.floor(62 / Math.max(code.length, 4))}cqw, ${max})`
  return (
    <div
      role="group"
      aria-label={`Code de la salle ${code}`}
      data-code={code}
      className={`mx-auto grid w-full grid-flow-col auto-cols-fr gap-1.5 sm:gap-2 ${box}`}
      style={{ containerType: "inline-size" }}
    >
      {code.split("").map((char, i) => (
        <span
          key={`${char}-${i}`}
          aria-hidden
          className="flex aspect-[4/5] items-center justify-center rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] font-display font-bold leading-none text-[#2e2014] shadow-[3px_3px_0_#2e2014]"
          style={{ fontSize: font }}
        >
          {char}
        </span>
      ))}
    </div>
  )
}

/** Copier le lien / le code. N'affiche "Copie" QUE si la copie a vraiment
 *  reussi (contexte non securise ou permission refusee : on le dit). */
export function ShareButtons({ code, link }: { code: string; link: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null)
  const [failed, setFailed] = useState(false)
  const copy = async (text: string, what: "code" | "link") => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard_unavailable")
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setFailed(false)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error("lobby_copy_failed", err)
      setFailed(true)
      setTimeout(() => setFailed(false), 3000)
    }
  }
  const base =
    "flex items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] px-4 py-3 text-sm font-bold shadow-[3px_3px_0_#2e2014] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#2e2014]"
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => void copy(link, "link")}
          className={`${base} ${copied === "link" ? "bg-[#7d9471] text-[#f4ecdb]" : "bg-[#c65133] text-[#f4ecdb]"}`}
        >
          {copied === "link" ? <Check size={15} /> : <Link2 size={15} />}
          {copied === "link" ? "Lien copié" : "Copier le lien"}
        </button>
        <button
          type="button"
          onClick={() => void copy(code, "code")}
          className={`${base} ${copied === "code" ? "bg-[#7d9471] text-[#f4ecdb]" : "bg-[#f4ecdb] text-[#2e2014]"}`}
        >
          {copied === "code" ? <Check size={15} /> : <Copy size={15} />}
          {copied === "code" ? "Code copié" : "Copier le code"}
        </button>
      </div>
      {failed ? (
        <p className="mt-2 rounded bg-[#f4ecdb] px-2 py-1 text-xs font-bold text-[#9c2f1d]">
          Copie impossible ici, recopie le code à la main.
        </p>
      ) : null}
    </div>
  )
}

function musicLine(p: MultiplayerParticipant): string | null {
  if (typeof p.track_count !== "number") return null
  if (p.track_count === 0) return "sans musique"
  return `${p.track_count} titre${p.track_count > 1 ? "s" : ""}`
}

/** Qui est dans la salle : une pastille par joueur, a la largeur de son pseudo
 *  (plus de "Ty..." tronque dans une grille a deux colonnes), avec ce qu'il
 *  amene comme musique. */
export function Roster({
  participants,
  hostUserId,
  currentUserId,
  accent,
  big = false,
  emptyLabel,
}: {
  participants: MultiplayerParticipant[]
  hostUserId: number | null
  currentUserId: number
  accent: string
  big?: boolean
  emptyLabel: string
}) {
  if (participants.length === 0) {
    return <p className="m-0 font-display text-base italic opacity-80">{emptyLabel}</p>
  }
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {participants.map(p => {
        const isHost = p.user_id === hostUserId
        const isMe = p.user_id === currentUserId
        const away = p.status === "away" || p.status === "disconnected"
        const music = musicLine(p)
        const name = p.username || `Joueur ${p.user_id}`
        return (
          <li
            key={p.user_id}
            className={`flex max-w-full items-center gap-2 rounded-full border-2 border-[#2e2014] bg-[#f4ecdb] py-1 pl-1 pr-3 text-[#2e2014] shadow-[2px_2px_0_#2e2014] ${away ? "opacity-60" : ""}`}
          >
            <span
              aria-hidden
              className={`flex shrink-0 items-center justify-center rounded-full border-2 border-[#2e2014] font-display font-bold ${big ? "h-9 w-9 text-lg" : "h-7 w-7 text-sm"}`}
              style={{ background: isHost ? accent : PAPER, color: INK }}
            >
              {name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 leading-tight">
              <span className={`block truncate font-display font-semibold ${big ? "text-lg" : "text-[15px]"}`}>
                {name}
                {isMe ? <span className="ml-1 font-sans text-xs font-bold text-[#6b573f]">(toi)</span> : null}
              </span>
              {music ? <span className="block text-[11px] text-[#6b573f]">{music}</span> : null}
            </span>
            {isHost ? <Crown aria-label="Hôte" size={15} className="shrink-0" /> : null}
            {away ? (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6b573f]">
                {p.status === "away" ? "absent" : "hors ligne"}
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

const ROUND_CHOICES = [5, 10, 15, 20]
const SECOND_CHOICES = [10, 15, 20, 30]

function Segmented<T extends number>({
  label,
  values,
  value,
  onPick,
  format,
  accent,
  accentText,
}: {
  label: string
  values: T[]
  value: T
  onPick: (v: T) => void
  format: (v: T) => string
  accent: string
  accentText: string
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#6b573f]">{label}</p>
      <div className="grid grid-cols-4 overflow-hidden rounded-md border-2 border-[#2e2014] bg-[#f4ecdb]">
        {values.map((v, i) => {
          const on = v === value
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(v)}
              className={`py-2 text-sm font-bold transition ${i > 0 ? "border-l-2 border-[#2e2014]" : ""} ${on ? "" : "text-[#6b573f] hover:bg-[#e0d4ba]"}`}
              style={on ? { background: accent, color: accentText } : undefined}
            >
              {format(v)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Reglages de l'hote, sauves au clic et appliques au lancement. Etait
 *  duplique a l'identique dans les lobbys a distance et autour d'une table. */
export function RoundSettings({ room, accent, accentText }: { room: MultiplayerRoom | null; accent: string; accentText: string }) {
  const [rounds, setRounds] = useState<number>(room?.question_count ?? 10)
  const [seconds, setSeconds] = useState<number>(Math.round((room?.round_duration_ms ?? 20000) / 1000))
  const save = (payload: { questionCount?: number; roundSeconds?: number }) => {
    if (!room) return
    void api.updateRoomConfig(room.room_code, payload).catch(err => console.error("room_config_save_failed", err))
  }
  return (
    <div className="space-y-3">
      <Segmented
        label="Manches"
        values={ROUND_CHOICES}
        value={rounds}
        onPick={n => { setRounds(n); save({ questionCount: n }) }}
        format={n => String(n)}
        accent={accent}
        accentText={accentText}
      />
      <Segmented
        label="Temps pour répondre"
        values={SECOND_CHOICES}
        value={seconds}
        onPick={s => { setSeconds(s); save({ roundSeconds: s }) }}
        format={s => `${s}s`}
        accent={accent}
        accentText={accentText}
      />
    </div>
  )
}

/** Zone du bouton Lancer : collee en bas de l'ecran sur telephone, a sa place
 *  dans la colonne sur ordinateur. UN SEUL element dans le DOM (pas une copie
 *  mobile et une copie bureau) pour que les scripts E2E trouvent un seul
 *  bouton "Lancer la partie". */
export function LaunchDock({ children, flush = false }: { children: ReactNode; flush?: boolean }) {
  return (
    <div className={`fixed inset-x-0 bottom-0 z-40 border-t-2 border-[#2e2014] bg-[#f4ecdb] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 ${flush ? "" : "lg:mt-5"}`}>
      <div className="mx-auto max-w-xl lg:max-w-none">{children}</div>
    </div>
  )
}

/** Le bouton Lancer est TOUJOURS vermillon, quel que soit le mode : c'est la
 *  couleur de l'action principale dans le brief. Les couleurs de mode vont au
 *  bloc de la salle et aux reglages, pour que rien ne lui dispute l'oeil. */
export function LaunchButton({
  onStart,
  canStart,
  starting,
  importing = false,
  hint,
}: {
  onStart: () => void
  canStart: boolean
  starting: boolean
  importing?: boolean
  hint?: string | null
}) {
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={onStart}
        disabled={starting || !canStart}
        className="w-full rounded-md border-2 border-[#2e2014] bg-[#c65133] px-6 py-3.5 text-center font-display text-xl font-bold text-[#f4ecdb] shadow-[5px_5px_0_#2e2014] transition-all duration-150 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#2e2014] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[5px_5px_0_#2e2014] lg:py-4"
      >
        {starting ? "Lancement…" : importing ? "Import en cours…" : "Lancer la partie"}
      </button>
      {hint ? <p className="m-0 text-center text-xs text-[#6b573f]">{hint}</p> : null}
    </div>
  )
}

/** Ce que voit un invite a la place du bouton : qui lance, sans faux bouton
 *  grise qui ressemblait a une panne ("En attente du host..." en rose pale). */
export function WaitingForHost({ hostName, accent }: { hostName: string | null; accent: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-4 py-3 shadow-[3px_3px_0_rgba(46,32,20,.18)]">
      <span aria-hidden className="relative flex h-3 w-3 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: accent }} />
        <span className="relative inline-flex h-3 w-3 rounded-full border border-[#2e2014]" style={{ background: accent }} />
      </span>
      <p className="m-0 text-sm text-[#2e2014]">
        {hostName ? (
          <>
            <b>{hostName}</b> lance la partie quand tout le monde est là
          </>
        ) : (
          "L'hôte lance la partie quand tout le monde est là"
        )}
      </p>
    </div>
  )
}

/** Chat : panneau dans la colonne sur ordinateur, bouton flottant sur
 *  telephone (au-dessus de la barre Lancer quand elle existe). */
export function ChatDock({
  messages,
  onSend,
  currentUserId,
  accent,
  emptyLabel,
  placeholder,
  raised,
  desktopHeight = "h-[320px]",
}: {
  messages: LobbyChatMessage[]
  onSend: (message: string) => void
  currentUserId: number
  accent: string
  emptyLabel?: string
  placeholder?: string
  raised: boolean
  desktopHeight?: string
}) {
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(0)
  useEffect(() => { if (open) setSeen(messages.length) }, [open, messages.length])
  const unread = Math.max(0, messages.length - seen)
  const bottom = raised ? "bottom-[calc(96px+env(safe-area-inset-bottom))]" : "bottom-5"
  return (
    <>
      <div className={`hidden lg:block ${desktopHeight}`}>
        <LobbyChat messages={messages} onSend={onSend} currentUserId={currentUserId} accent={accent} emptyLabel={emptyLabel} placeholder={placeholder} />
      </div>
      <div className="lg:hidden">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le chat"
            className={`fixed right-4 z-[45] flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#2e2014] text-[#f4ecdb] shadow-[3px_3px_0_rgba(46,32,20,.35)] transition active:translate-x-[2px] active:translate-y-[2px] ${bottom}`}
          >
            <MessageCircle size={22} />
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-[#2e2014] px-1 text-[10px] font-bold text-[#2e2014]" style={{ background: accent }}>
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </button>
        ) : (
          <>
            <div className="fixed inset-0 z-[46] bg-[#2e2014]/20" onClick={() => setOpen(false)} />
            <div className={`fixed right-4 z-[47] h-[min(460px,64vh)] w-[min(340px,calc(100vw-2rem))] ${bottom}`}>
              <LobbyChat
                messages={messages}
                onSend={onSend}
                currentUserId={currentUserId}
                accent={accent}
                emptyLabel={emptyLabel}
                placeholder={placeholder}
                onClose={() => setOpen(false)}
              />
            </div>
          </>
        )}
      </div>
    </>
  )
}
