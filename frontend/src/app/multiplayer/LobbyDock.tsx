"use client"

// La bulle du lobby : le chat et pierre-feuille-ciseaux dans un seul panneau
// flottant, en bas a droite (demande de Tym le 30/09/2026 : ils prenaient trop
// de place dans la salle d'attente).
//
// Ouverture : le panneau est TOUJOURS monte (rien a construire au moment
// d'ouvrir) et n'anime que transform et opacity, depuis le centre de la bulle.
// La premiere version animait un clip-path en calc() : l'interpolation ne
// prenait pas, le panneau apparaissait d'un coup en semi-transparence.
//
// Les deux se battent pour la place : celui qu'on survole (ou qu'on touche sur
// telephone) grandit avec un ressort qui depasse, l'autre est bouscule et se
// replie sur une ligne, et le badge VS entre les deux encaisse le choc. Un
// nouveau message fait riposter le chat, un defi recu fait avancer le jeu.
// Rien de tout ca si l'utilisateur a demande a reduire les animations.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { motion, useAnimationControls, useReducedMotion, type Variants } from "framer-motion"
import { MessageCircle, Swords, X } from "lucide-react"
import { LobbyChat } from "./LobbyChat"
import { LobbyRps } from "./LobbyRps"
import type { LobbyChatMessage, LobbyRpsState } from "./lobbyTypes"

type Side = "chat" | "rps"
type Player = { userId: number; username: string | null }

const CLOSE_DELAY_MS = 350 // le temps de passer de la bulle au panneau
const HOVER_INTENT_MS = 110 // on ne declenche pas la bagarre en simple passage
// Parts de hauteur (flex-grow). A egalite le chat a un peu plus : il a une saisie.
const SHARES: Record<"egalite" | Side, Record<Side, number>> = {
  egalite: { chat: 1.3, rps: 1 },
  chat: { chat: 3.4, rps: 1 },
  rps: { chat: 1, rps: 2.3 },
}
const FIGHT = { type: "spring" as const, stiffness: 240, damping: 12, mass: 0.9 } // depasse, puis se pose
// Ouverture : ~300 ms, un soupcon de depassement pour que le geste se voie
// (la version precedente etait en place en 110 ms, trop vite pour etre percue).
const OPEN = { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.8 }

function useCanHover(): boolean {
  const [can, setCan] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)")
    const update = () => setCan(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return can
}

function rpsSummary(rps: LobbyRpsState, currentUserId: number, players: Player[]): string {
  const name = (id: number) => (id === currentUserId ? "Toi" : players.find(p => p.userId === id)?.username || `Joueur ${id}`)
  if (rps.incoming) return `${rps.incoming.fromUsername || `Joueur ${rps.incoming.fromUserId}`} te défie !`
  if (rps.active) return rps.active.myMove ? `Duel contre ${name(rps.active.opponentId)} : à lui de jouer` : `Duel contre ${name(rps.active.opponentId)} : à toi !`
  if (rps.pendingTargetId != null) return `Défi envoyé à ${name(rps.pendingTargetId)}…`
  const top = [...rps.scoreboard].sort((a, b) => b.wins - a.wins)[0]
  if (top) return `En tête : ${top.userId === currentUserId ? "toi" : top.username || `Joueur ${top.userId}`} (${top.wins})`
  return players.some(p => p.userId !== currentUserId) ? "Défie quelqu'un en attendant" : "En attente d'un adversaire"
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
}) {
  const reduce = useReducedMotion()
  const canHover = useCanHover()
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [winner, setWinner] = useState<"egalite" | Side>("egalite")
  const winnerRef = useRef<"egalite" | Side>("egalite")
  const [bump, setBump] = useState<Side | null>(null)
  const [seen, setSeen] = useState(messages.length)
  const vs = useAnimationControls()
  const chatShake = useAnimationControls()
  const rpsShake = useAnimationControls()

  const rpsCalls = Boolean(rps && (rps.incoming || (rps.active && !rps.active.myMove)))
  const unread = Math.max(0, messages.length - seen)
  useEffect(() => { if (open) setSeen(messages.length) }, [open, messages.length])

  /** La bagarre : le gagnant prend la place, le perdant est bouscule. */
  const fight = useCallback((side: Side) => {
    if (winnerRef.current === side) return
    winnerRef.current = side
    setWinner(side)
    if (!reduce) {
      void vs.start({ rotate: [0, -24, 18, -10, 5, 0], scale: [1, 1.4, 1.1, 1.25, 1], transition: { duration: 0.55 } })
      void (side === "chat" ? rpsShake : chatShake).start({ x: [0, -7, 5, -3, 0], transition: { duration: 0.4 } })
    }
  }, [reduce, vs, chatShake, rpsShake])

  // Un message des autres fait riposter le chat, un resultat de duel fait
  // avancer le jeu : un coup d'epaule, sans changer de gagnant.
  const lastCount = useRef(messages.length)
  useEffect(() => {
    const fresh = messages.length > lastCount.current && messages[messages.length - 1]?.userId !== currentUserId
    lastCount.current = messages.length
    if (!open || !fresh || reduce) return
    setBump("chat")
    void vs.start({ rotate: [0, 14, -8, 0], transition: { duration: 0.35 } })
    const t = setTimeout(() => setBump(null), 380)
    return () => clearTimeout(t)
  }, [messages, open, currentUserId, reduce, vs])
  // Un defi en attente : le jeu gagne la place, meme a la prochaine ouverture.
  useEffect(() => { if (rpsCalls) fight("rps") }, [rpsCalls, fight])

  const cancel = (t: typeof closeTimer) => { if (t.current) { clearTimeout(t.current); t.current = null } }
  const close = useCallback(() => {
    cancel(closeTimer); cancel(intentTimer)
    setPinned(false); setOpen(false)
    // A la prochaine ouverture on repart a egalite, sauf si un defi attend.
    const next = rpsCalls ? "rps" : "egalite"
    winnerRef.current = next
    setWinner(next)
  }, [rpsCalls])
  const hoverIn = () => { cancel(closeTimer); setOpen(true) }
  const hoverOut = () => {
    cancel(intentTimer)
    if (pinned) return
    cancel(closeTimer)
    closeTimer.current = setTimeout(() => {
      // Jamais pendant qu'on ecrit un message.
      if (rootRef.current?.contains(document.activeElement) && document.activeElement?.tagName === "INPUT") return
      close()
    }, CLOSE_DELAY_MS)
  }
  const aim = (side: Side) => {
    if (!canHover) return
    cancel(intentTimer)
    intentTimer.current = setTimeout(() => fight(side), HOVER_INTENT_MS)
  }
  const toggle = () => {
    cancel(closeTimer)
    if (open && (pinned || !canHover)) close()
    else { setOpen(true); setPinned(true) }
  }

  // Echap et clic a l'exterieur ferment le panneau.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    const onDown = (e: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) close() }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onDown)
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown) }
  }, [open, close])
  useEffect(() => () => { cancel(closeTimer); cancel(intentTimer) }, [])

  const bottom = raised ? "bottom-[calc(96px+env(safe-area-inset-bottom))] lg:bottom-6" : "bottom-5 lg:bottom-6"
  const shares = SHARES[rps ? winner : "chat"]
  const grow = (side: Side) => shares[side] + (bump === side ? 0.7 : 0)
  const rpsCompact = rps ? winner === "chat" : false
  const badge = rpsCalls ? "!" : unread > 0 ? (unread > 9 ? "9+" : String(unread)) : null

  const panel: Variants = reduce
    ? { closed: { opacity: 0, transitionEnd: { visibility: "hidden" } }, open: { opacity: 1, visibility: "visible" } }
    : {
        closed: { opacity: 0, scale: 0.25, y: 24, transition: { duration: 0.2, ease: "easeIn" }, transitionEnd: { visibility: "hidden" } },
        open: { opacity: 1, scale: 1, y: 0, visibility: "visible", transition: OPEN },
      }
  const enter = (from: number): Variants => reduce
    ? { closed: {}, open: {} }
    : { closed: { opacity: 0, y: from }, open: { opacity: 1, y: 0, transition: { delay: 0.07, duration: 0.22 } } }

  // Le titre du jeu commence apres le badge VS, pose a gauche de la ligne de front.
  const head = (side: Side, label: string, extra?: ReactNode) => (
    <button
      type="button"
      onClick={() => fight(side)}
      className={`flex w-full shrink-0 items-center justify-between gap-2 py-2 pr-4 text-left ${side === "rps" ? "pl-12" : "pl-4"}`}
    >
      <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#2e2014]">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full border-[1.5px] border-[#2e2014]" style={{ background: accent }} />
        {label}
      </span>
      {extra}
    </button>
  )

  return (
    <div
      ref={rootRef}
      className={`fixed right-4 z-[45] flex flex-col items-end gap-3 lg:right-6 ${bottom}`}
      onMouseEnter={canHover ? hoverIn : undefined}
      onMouseLeave={canHover ? hoverOut : undefined}
    >
      <motion.div
        id={panelId}
        role="dialog"
        aria-label={rps ? "Chat et pierre-feuille-ciseaux" : "Chat"}
        aria-hidden={!open}
        inert={!open}
        initial="closed"
        animate={open ? "open" : "closed"}
        variants={panel}
        // Le panneau grandit depuis le centre de la bulle (28 px du bord droit,
        // 40 px sous le panneau) : transform-origin peut sortir de la boite.
        style={{ transformOrigin: "calc(100% - 28px) calc(100% + 40px)", willChange: "transform, opacity" }}
        className="flex h-[min(480px,64vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border-2 border-[#2e2014] bg-[#ece1c8] shadow-[5px_5px_0_rgba(46,32,20,.25)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b-2 border-[#2e2014] px-4 py-2">
          <span className="font-display text-base font-semibold text-[#2e2014]">En attendant</span>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer"
            className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-[#2e2014] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Le chat */}
        <motion.section
          role="region"
          aria-label="Le chat"
          className="relative flex min-h-[92px] flex-col overflow-hidden"
          style={{ flexBasis: 0 }}
          animate={{ flexGrow: grow("chat") }}
          transition={reduce ? { duration: 0 } : FIGHT}
          onMouseEnter={() => aim("chat")}
          onFocusCapture={() => fight("chat")}
        >
          <motion.div variants={enter(-10)} initial="closed" animate={open ? "open" : "closed"} className="flex min-h-0 flex-1 flex-col">
            <motion.div animate={chatShake} className="flex min-h-0 flex-1 flex-col">
              {head("chat", "Le chat")}
              <div className="min-h-0 flex-1">
                <LobbyChat bare messages={messages} onSend={onSend} currentUserId={currentUserId} accent={accent} placeholder={placeholder} emptyLabel={emptyLabel} />
              </div>
            </motion.div>
          </motion.div>
        </motion.section>

        {rps ? (
          <>
            {/* Le badge VS, pose sur la ligne de front */}
            <div className="relative z-10 h-0 shrink-0 border-t-2 border-[#2e2014]">
              <motion.span
                aria-hidden
                animate={vs}
                className="absolute left-3 top-0 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#2e2014] font-display text-[10px] font-bold italic text-[#f4ecdb] shadow-[2px_2px_0_rgba(46,32,20,.3)]"
                style={{ background: "#2e2014" }}
              >
                VS
              </motion.span>
            </div>

            {/* Pierre, feuille, ciseaux */}
            <motion.section
              role="region"
              aria-label="Pierre, feuille, ciseaux"
              className="relative flex min-h-[76px] flex-col overflow-hidden bg-[#efe5d0]"
              style={{ flexBasis: 0 }}
              animate={{ flexGrow: grow("rps") }}
              transition={reduce ? { duration: 0 } : FIGHT}
              onMouseEnter={() => aim("rps")}
              onFocusCapture={() => fight("rps")}
            >
              <motion.div variants={enter(10)} initial="closed" animate={open ? "open" : "closed"} className="flex min-h-0 flex-1 flex-col">
                <motion.div animate={rpsShake} className="flex min-h-0 flex-1 flex-col">
                  {head("rps", "Pierre, feuille, ciseaux", (
                    <span className="flex items-center gap-1.5">
                      {rpsCalls ? <span aria-label="Un défi t'attend" className="h-2.5 w-2.5 animate-pulse rounded-full border border-[#2e2014]" style={{ background: accent }} /> : null}
                      <Swords aria-hidden className="h-4 w-4 text-[#6b573f]" />
                    </span>
                  ))}
                  <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-3">
                    <motion.p
                      aria-hidden={!rpsCompact}
                      initial={false}
                      animate={{ opacity: rpsCompact ? 1 : 0, y: rpsCompact ? 0 : -6 }}
                      transition={{ duration: 0.18 }}
                      className="pointer-events-none absolute inset-x-4 top-0 m-0 truncate text-sm text-[#2e2014]"
                    >
                      {rpsSummary(rps, currentUserId, players)}
                    </motion.p>
                    <motion.div
                      initial={false}
                      animate={{ opacity: rpsCompact ? 0 : 1 }}
                      transition={{ duration: 0.2 }}
                      className={rpsCompact ? "pointer-events-none" : ""}
                      inert={rpsCompact}
                    >
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
                    </motion.div>
                  </div>
                </motion.div>
              </motion.div>
            </motion.section>
          </>
        ) : null}
      </motion.div>

      <motion.button
        type="button"
        onClick={toggle}
        aria-label={rps ? "Chat et pierre-feuille-ciseaux" : "Chat"}
        aria-expanded={open}
        aria-controls={panelId}
        className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#2e2014] text-[#f4ecdb] shadow-[3px_3px_0_rgba(46,32,20,.35)]"
        whileHover={reduce ? undefined : { scale: 1.1, rotate: -8 }}
        whileTap={reduce ? undefined : { scale: 0.9 }}
        transition={OPEN}
      >
        {/* Un petit frisson a chaque nouveau message (cle = nombre de messages). */}
        <motion.span
          key={`${messages.length}-${open}`}
          className="flex"
          initial={false}
          animate={!reduce && !open && unread > 0 ? { rotate: [0, -16, 12, -8, 4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.span className="relative flex" animate={{ rotate: open ? 90 : 0, scale: open ? 0.9 : 1 }} transition={OPEN}>
            {open ? <X size={22} /> : (
              <>
                <MessageCircle size={22} />
                {rps ? <Swords aria-hidden size={11} className="absolute -bottom-1 -right-1.5 rounded-full bg-[#2e2014]" /> : null}
              </>
            )}
          </motion.span>
        </motion.span>
        {badge && !open ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-[#2e2014] px-1 text-[10px] font-bold text-[#2e2014]" style={{ background: accent }}>
            {rpsCalls && !reduce ? <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: accent }} /> : null}
            <span className="relative">{badge}</span>
          </span>
        ) : null}
      </motion.button>
    </div>
  )
}
