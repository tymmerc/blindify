"use client"

// La bulle du lobby, en bas a droite : le chat et pierre-feuille-ciseaux.
//
// - Au SURVOL, dans la bulle meme, une bulle de chat et une paire de ciseaux
//   se battent en boucle (elles se foncent dessus, un eclat au choc, recul).
//   C'est ce que Tym voulait (30/09) : la bagarre est dans la bulle, pas dans
//   le panneau.
// - Un message des autres : le chat frappe. Un defi recu : les ciseaux
//   attaquent. Visible meme panneau ferme, c'est la notification.
// - Au CLIC (ou au toucher), la bulle SE TRANSFORME en panneau (animation de
//   mise en page partagee : la meme boite grandit, arrondi et couleur
//   compris), puis le contenu apparait. Fermeture : le panneau se replie dans
//   la bulle. Seules des transformations sont animees, pas de clip-path.
// - Dans le panneau, deux onglets et un curseur qui glisse de l'un a l'autre.
// Rien de tout ca si l'utilisateur a demande a reduire les animations.
// La meme bulle sert au chat pendant la partie (ecran de jeu « autour d'une
// table »), sans pierre-feuille-ciseaux et avec un autre titre.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type Variants } from "framer-motion"
import { MessageCircle, Scissors, X } from "lucide-react"
import { LobbyChat } from "./LobbyChat"
import { LobbyRps } from "./LobbyRps"
import type { LobbyChatMessage, LobbyRpsState } from "./lobbyTypes"
import { countUnread, lastStamp } from "@/lib/chatUnread"

type Tab = "chat" | "rps"
type Pose = "idle" | "fight" | "punch" | "strike"
type Player = { userId: number; username: string | null }

// Variables CSS pures : framer-motion sait les animer (il lit leur valeur calculee).
const INK = "var(--ink-block)"
const CARD = "var(--paper-deep)"
// La transformation bulle -> panneau : un ressort sans rebond (un rebond
// deformerait le texte pendant la mise a l'echelle).
const MORPH = { type: "spring" as const, stiffness: 430, damping: 40, mass: 0.9 }

/* La bagarre. En boucle au survol ; "punch" et "strike" sont des coups uniques. */
const LOOP = { duration: 0.85, repeat: Infinity, ease: "easeInOut" as const, times: [0, 0.3, 0.52, 1] }
const ONCE = { duration: 0.55, ease: "easeOut" as const, times: [0, 0.35, 1] }
const REST = { type: "spring" as const, stiffness: 300, damping: 18 }
const chatV: Variants = {
  idle: { x: -8, y: 1, rotate: -6, scale: 1, transition: REST },
  fight: { x: [-8, -1, -12, -8], y: [1, -1, 2, 1], rotate: [-6, 12, -16, -6], scale: [1, 1.12, 0.94, 1], transition: LOOP },
  punch: { x: [-8, 4, -8], rotate: [-6, 18, -6], scale: [1, 1.3, 1], transition: ONCE },
  strike: { x: [-8, -14, -8], rotate: [-6, -24, -6], scale: [1, 0.85, 1], transition: ONCE },
}
const scissorsV: Variants = {
  idle: { x: 9, y: -1, rotate: 14, scale: 1, transition: REST },
  fight: { x: [9, 2, 13, 9], y: [-1, 1, -2, -1], rotate: [14, -34, 26, 14], scale: [1, 1.1, 0.95, 1], transition: LOOP },
  punch: { x: [9, 15, 9], rotate: [14, 50, 14], scale: [1, 0.85, 1], transition: ONCE },
  strike: { x: [9, -3, 9], rotate: [14, -50, 14], scale: [1, 1.3, 1], transition: ONCE },
}
const soloV: Variants = {
  idle: { rotate: 0, scale: 1, transition: REST },
  punch: { rotate: [0, -14, 0], scale: [1, 1.25, 1], transition: ONCE },
}
const impactV: Variants = {
  idle: { scale: 0, opacity: 0, transition: { duration: 0.15 } },
  fight: { scale: [0, 0, 1.3, 0], opacity: [0, 0, 1, 0], rotate: [0, 0, 45, 90], transition: LOOP },
  punch: { scale: [0, 1.3, 0], opacity: [0, 1, 0], transition: ONCE },
  strike: { scale: [0, 1.3, 0], opacity: [0, 1, 0], transition: ONCE },
}

export function LobbyDock({
  messages,
  onSend,
  currentUserId,
  players,
  rps,
  accent,
  raised,
  placeholder,
  emptyLabel,
  title = "En attendant",
}: {
  messages: LobbyChatMessage[]
  onSend: (message: string) => void
  currentUserId: number
  players: Player[]
  rps?: LobbyRpsState
  accent: string
  /** Sur telephone, au-dessus de la barre "Lancer" collee en bas. */
  raised: boolean
  placeholder?: string
  emptyLabel?: string
  /** Titre du panneau ouvert. */
  title?: string
}) {
  const reduce = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLButtonElement>(null)
  // Fermeture au clavier ou par la croix : le focus revient sur la bulle.
  // Pas apres un clic ailleurs (il irait voler le champ de reponse).
  const refocusBubble = useRef(false)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("chat")
  const [dir, setDir] = useState(1)
  const [hovered, setHovered] = useState(false)
  const [hit, setHit] = useState<"punch" | "strike" | null>(null)
  const [seenAt, setSeenAt] = useState(() => lastStamp(messages))
  const everOpened = useRef(false)

  const rpsCalls = Boolean(rps && (rps.incoming || (rps.active && !rps.active.myMove)))
  const unread = countUnread(messages, seenAt, currentUserId)
  const newest = lastStamp(messages)
  useEffect(() => { if (open && tab === "chat") setSeenAt(newest) }, [open, tab, newest])

  // Les coups uniques : un message des autres (le chat frappe), un defi recu
  // (les ciseaux attaquent). Ils rejouent a chaque nouvel evenement.
  const lastHeard = useRef(newest)
  useEffect(() => {
    const fresh = newest > lastHeard.current && messages[messages.length - 1]?.userId !== currentUserId
    lastHeard.current = newest
    if (!fresh || reduce) return
    setHit("punch")
    const t = setTimeout(() => setHit(null), 650)
    return () => clearTimeout(t)
  }, [messages, newest, currentUserId, reduce])
  useEffect(() => {
    if (!rpsCalls || reduce) return
    setHit("strike")
    const t = setTimeout(() => setHit(null), 650)
    return () => clearTimeout(t)
  }, [rpsCalls, reduce])
  useEffect(() => { if (rpsCalls && !open) setTab("rps") }, [rpsCalls, open])

  const pose: Pose = reduce ? "idle" : hit ?? (hovered && !open ? "fight" : "idle")

  const show = (next: Tab) => { setDir(next === "rps" ? 1 : -1); setTab(next) }
  const openPanel = () => { everOpened.current = true; setHovered(false); setOpen(true) }
  const close = useCallback((refocus: boolean) => { refocusBubble.current = refocus; setOpen(false) }, [])

  // A l'ouverture, le focus entre dans le panneau (sans ouvrir le clavier du
  // telephone) ; a la fermeture par Echap ou la croix, il revient sur la bulle.
  useEffect(() => {
    if (open) panelRef.current?.focus()
    else if (refocusBubble.current) { refocusBubble.current = false; bubbleRef.current?.focus() }
  }, [open])

  // Echap et clic a l'exterieur ferment le panneau.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(true) }
    const onDown = (e: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false) }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onDown)
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown) }
  }, [open, close])

  const bottom = raised ? "bottom-[calc(96px+env(safe-area-inset-bottom))] lg:bottom-6" : "bottom-5 lg:bottom-6"
  const badge = rpsCalls ? "!" : unread > 0 ? (unread > 9 ? "9+" : String(unread)) : null
  const bubbleLabel = [
    rps ? "Chat et pierre-feuille-ciseaux" : "Chat",
    unread > 0 ? `${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}` : null,
    rpsCalls ? "un défi t'attend" : null,
  ].filter(Boolean).join(", ")
  const morph = reduce ? { duration: 0 } : MORPH

  const tabBtn = (key: Tab, label: string, extra?: ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => show(key)}
      className={`relative z-0 flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors duration-200 ${
        tab === key ? "text-on-ink" : "text-ink-2 hover:text-ink"
      }`}
    >
      {tab === key ? (
        <motion.span
          layoutId="lobby-dock-onglet"
          className="absolute inset-0 -z-10 rounded-full bg-ink-block"
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
        />
      ) : null}
      {label}
      {extra}
    </button>
  )

  return (
    <div ref={rootRef} className={`fixed right-4 z-[45] lg:right-6 ${bottom}`}>
      <LayoutGroup id="lobby-dock">
        {open ? (
          <motion.div
            key="panneau"
            ref={panelRef}
            tabIndex={-1}
            layoutId="lobby-dock"
            role="dialog"
            aria-label={rps ? "Chat et pierre-feuille-ciseaux" : "Chat"}
            // La meme boite que la bulle : l'arrondi et la couleur se
            // transforment avec elle (arrondi en style, pour que framer le
            // corrige pendant la mise a l'echelle).
            style={{ borderRadius: 10 }}
            initial={{ backgroundColor: INK }}
            animate={{ backgroundColor: CARD }}
            transition={{ layout: morph, backgroundColor: { duration: reduce ? 0 : 0.22 } }}
            className="flex h-[min(480px,64vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden border-2 border-line outline-none shadow-[5px_5px_0_rgb(var(--c-shadow)/.25)]"
          >
            <motion.div
              className="flex min-h-0 flex-1 flex-col"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { delay: reduce ? 0 : 0.14, duration: 0.2, ease: "easeOut" } }}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-3">
                <span className="font-display text-lg font-semibold text-ink">{title}</span>
                <button
                  type="button"
                  onClick={() => close(true)}
                  aria-label="Fermer"
                  className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-line text-ink transition hover:bg-ink-block hover:text-on-ink"
                >
                  <X size={15} />
                </button>
              </div>
              {rps ? (
                <div role="tablist" className="mx-4 mb-3 flex shrink-0 gap-1 rounded-full border-2 border-line bg-paper p-1">
                  {tabBtn("chat", "Le chat", unread > 0 && tab !== "chat" ? (
                    <span className="rounded-full px-1.5 text-[9px] text-ink" style={{ background: accent }}>{unread}</span>
                  ) : null)}
                  {tabBtn("rps", "Pierre, feuille, ciseaux", rpsCalls ? (
                    <span aria-label="Un défi t'attend" className="h-2 w-2 animate-pulse rounded-full border border-line" style={{ background: accent }} />
                  ) : null)}
                </div>
              ) : null}
              <div className="relative min-h-0 flex-1 overflow-hidden border-t-2 border-line">
                <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                  <motion.div
                    key={rps ? tab : "chat"}
                    role="tabpanel"
                    aria-label={tab === "rps" && rps ? "Pierre, feuille, ciseaux" : "Le chat"}
                    custom={dir}
                    variants={{
                      enter: (d: number) => ({ x: reduce ? 0 : d * 40, opacity: 0 }),
                      center: { x: 0, opacity: 1 },
                      leave: (d: number) => ({ x: reduce ? 0 : d * -40, opacity: 0 }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="leave"
                    transition={{ type: "spring", stiffness: 420, damping: 40 }}
                    className="absolute inset-0 flex flex-col"
                  >
                    {tab === "rps" && rps ? (
                      <div className="h-full overflow-y-auto p-4">
                        <LobbyRps
                          bare
                          players={players}
                          currentUserId={currentUserId}
                          accent={accent}
                          scoreboard={rps.scoreboard}
                          incoming={rps.incoming}
                          active={rps.active}
                          pendingTargetId={rps.pendingTargetId}
                          result={rps.result}
                          onChallenge={rps.challenge}
                          onAccept={rps.accept}
                          onDecline={rps.decline}
                          onPlay={rps.play}
                        />
                      </div>
                    ) : (
                      <LobbyChat bare messages={messages} onSend={onSend} currentUserId={currentUserId} accent={accent} placeholder={placeholder} emptyLabel={emptyLabel} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.button
            key="bulle"
            ref={bubbleRef}
            layoutId="lobby-dock"
            type="button"
            onClick={openPanel}
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            aria-label={bubbleLabel}
            aria-haspopup="dialog"
            style={{ borderRadius: 30 }}
            // Au retour du panneau, la bulle repasse du papier a l'encre.
            initial={everOpened.current ? { backgroundColor: CARD } : false}
            animate={{ backgroundColor: INK }}
            whileHover={reduce ? undefined : { scale: 1.07 }}
            whileTap={reduce ? undefined : { scale: 0.93 }}
            transition={{ layout: morph, backgroundColor: { duration: reduce ? 0 : 0.2 }, scale: { type: "spring", stiffness: 420, damping: 22 } }}
            className="relative flex h-[60px] w-[60px] items-center justify-center border-2 border-line text-on-ink shadow-[3px_3px_0_rgb(var(--c-shadow)/.35)]"
          >
            {rps ? (
              <>
                {/* La bagarre : un eclat au point de choc, la bulle de chat a
                    gauche, les ciseaux a droite. */}
                <motion.span aria-hidden className="pointer-events-none absolute" variants={impactV} initial="idle" animate={pose}>
                  <svg width="26" height="26" viewBox="0 0 26 26">
                    <path d="M13 1l2.6 7.2L23 6l-4.7 5.8L25 15l-7.3.9L18 23l-5-5.2L8 23l.3-7.1L1 15l6.7-3.2L3 6l7.4 2.2z" fill={accent} stroke="var(--line)" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </motion.span>
                <motion.span aria-hidden className="absolute flex" variants={chatV} initial="idle" animate={pose}>
                  <MessageCircle size={20} strokeWidth={2.4} />
                </motion.span>
                <motion.span aria-hidden className="absolute flex" variants={scissorsV} initial="idle" animate={pose}>
                  <Scissors size={17} strokeWidth={2.4} />
                </motion.span>
              </>
            ) : (
              // Sans pierre-feuille-ciseaux (pendant la partie) : la bulle de
              // chat seule, qui sursaute a chaque message des autres.
              <motion.span aria-hidden className="flex" variants={soloV} initial="idle" animate={hit === "punch" && !reduce ? "punch" : "idle"}>
                <MessageCircle size={22} strokeWidth={2.4} />
              </motion.span>
            )}
            {badge ? (
              <span aria-hidden className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-line px-1 text-[10px] font-bold text-on-accent" style={{ background: accent }}>
                {rpsCalls && !reduce ? <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: accent }} /> : null}
                <span className="relative">{badge}</span>
              </span>
            ) : null}
          </motion.button>
        )}
      </LayoutGroup>
    </div>
  )
}
