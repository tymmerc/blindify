"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Play, Trophy, Volume2, VolumeX } from "lucide-react"
import type { MultiplayerGameState, UserSummary } from "@/lib/types"

type ChatMessage = {
  userId: number
  username: string
  message: string
  timestamp: number
}

type PlayerRow = {
  userId: number
  username?: string | null
  score: number
  accuracy?: number | null
  avatar?: string | null
  hasAnswered: boolean
  lastGuess?: string | null
  lastVerdict?: string | null
  isReady: boolean
  streak?: number
  bestStreak?: number
  totalReactionMs?: number
  disconnected?: boolean
}

type UiPhase = "guessing" | "locked" | "reveal"

type Props = {
  user: UserSummary
  state: MultiplayerGameState | null
  uiPhase: UiPhase
  isPlaying: boolean
  /** Sequence platine : le vinyle ne tourne que bras pose ("down"). */
  needleStage?: "raised" | "dropping" | "down"
  isLocked: boolean
  isRevealed: boolean
  remaining: number
  totalSeconds: number
  sortedPlayers: PlayerRow[]
  answeredCount: number
  displayAnsweredCount: number
  playerCount: number
  readyCount: number
  guessTitle: string
  setGuessTitle: (s: string) => void
  guessArtist: string
  setGuessArtist: (s: string) => void
  sourceGuess: number | null
  setSourceGuess: (id: number | null) => void
  localHasAnswered: boolean
  onSubmit: () => void
  /** "Je sais pas" : reponse vide -> reveal anticipe quand tout le monde a tranche. */
  onPass: () => void
  disabled?: boolean
  muted: boolean
  volume: number
  onToggleMute: () => void
  onVolumeChange: (v: number) => void
  manualPlayRequired: boolean
  isAudioPhase: boolean
  onManualPlay: () => void
  currentTrack: MultiplayerGameState["currentTrack"] | null
  trackOwnerUsername: string | null
  player: PlayerRow | null
  revealCountdown: number
  onReady: () => void
  onRematch?: () => void
  onExit?: () => void
  chatMessages: ChatMessage[]
  chatInput: string
  setChatInput: (s: string) => void
  onSendChat?: (s: string) => void
  chatScrollRef: RefObject<HTMLDivElement | null>
}

const TERRA = "#c65133"
const GOLD = "#e0a32e"
const SAGE = "#7d9471"
const BLUEGRAY = "#a8b8c8"
const INK = "#2e2014"
const PAPER = "#f4ecdb"

const playerColor = (idx: number) => [TERRA, GOLD, SAGE, BLUEGRAY][idx % 4]

const initial = (name: string | null | undefined) =>
  (name && name.trim()[0]?.toUpperCase()) || "?"

export function TheaterGameView(props: Props) {
  const {
    user, state, uiPhase, isPlaying, needleStage = "down", isLocked, isRevealed,
    remaining, totalSeconds, sortedPlayers, displayAnsweredCount, playerCount, readyCount,
    guessTitle, setGuessTitle, guessArtist, setGuessArtist, sourceGuess, setSourceGuess,
    localHasAnswered, onSubmit, onPass, disabled,
    muted, volume, onToggleMute, onVolumeChange,
    manualPlayRequired, isAudioPhase, onManualPlay,
    currentTrack, trackOwnerUsername, player, revealCountdown,
    onReady, onRematch, onExit,
    chatMessages, chatInput, setChatInput, onSendChat, chatScrollRef,
  } = props

  const currentRound = state?.currentRound ?? 0
  const totalRounds = state?.totalRounds ?? 10
  const isFinished = state?.phase === "FINISHED"

  // Picker "qui a ajoute ?" : 3 candidats max (le bon + 2 leurres) fournis par le
  // serveur via ownerChoices ; fallback sur tous les joueurs si absent (< 3 joueurs).
  const pickerPlayers = useMemo<PlayerRow[]>(() => {
    const choices = currentTrack?.ownerChoices
    if (!choices || choices.length === 0) return sortedPlayers
    return choices.map(
      id => sortedPlayers.find(p => p.userId === id) ?? ({ userId: id, username: null, avatar: null } as PlayerRow)
    )
  }, [currentTrack?.ownerChoices, sortedPlayers])

  const dots = useMemo(
    () => Array.from({ length: Math.max(1, totalRounds) }, (_, i) => i + 1),
    [totalRounds]
  )

  const timerUrgent = isPlaying && remaining <= 10 && remaining > 0
  const timerLabel = isPlaying ? String(remaining).padStart(2, "0") : isLocked ? "--" : "GO"

  const verdictTone = (v: string | null | undefined) =>
    v === "correct" ? SAGE : v === "close" ? GOLD : "#9c2f1d"
  const verdictLabel = (v: string | null | undefined) =>
    v === "correct" ? "Validé" : v === "close" ? "Partiel" : "Raté"

  const me = user.id


  return (
    <div className="theater-root relative min-h-screen overflow-hidden" style={{ background: "transparent", color: INK }}>
      <style jsx global>{theaterStyles}</style>

      <div className="theater-stage relative z-[3] grid h-screen px-6 pt-4 pb-5 gap-2" style={{ gridTemplateRows: "auto 1fr auto" }}>

        {/* ====================== TOP BAR ====================== */}
        <div className="grid items-center gap-4 theater-topbar" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
          <div className="theater-brand">
            <b>BLIND</b>Z
            <small>À DISTANCE · LIVE</small>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="theater-pill">
              <span className="theater-round">ROUND <b>{String(currentRound).padStart(2, "0")} / {String(totalRounds).padStart(2, "0")}</b></span>
              <span className="theater-sep" />
              <span className={`theater-timer ${timerUrgent ? "urgent" : ""}`}>{timerLabel}</span>
            </div>
            <div className="theater-rdots">
              {dots.map(n => (
                <span
                  key={n}
                  className={`theater-rdot ${n < currentRound ? "done" : n === currentRound ? "current" : ""}`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button className="theater-vol" onClick={onToggleMute} title={muted ? "Activer le son" : "Couper le son"}>
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : Math.round(volume * 100)}
              onChange={e => onVolumeChange(Number(e.target.value) / 100)}
              className="theater-volume-slider"
              aria-label="Volume"
            />
            {onExit && (
              <button className="theater-quit" onClick={onExit}>Quitter</button>
            )}
          </div>
        </div>

        {/* ====================== CENTER ====================== */}
        <div className="grid items-center gap-9 min-h-0" style={{ gridTemplateColumns: "1fr 320px" }}>
          <AnimatePresence mode="wait">
            {isRevealed ? (
              <RevealStage
                key="reveal"
                currentTrack={currentTrack}
                trackOwnerUsername={trackOwnerUsername}
                player={player}
                revealCountdown={revealCountdown}
                onReady={onReady}
                readyCount={readyCount}
                playerCount={playerCount}
                isFinished={isFinished}
                onRematch={onRematch}
              />
            ) : (
              <GuessingStage
                needleStage={needleStage}
                isRevealed={isRevealed}
                key="guessing"
                isAudioPhase={isAudioPhase}
                manualPlayRequired={manualPlayRequired}
                onManualPlay={onManualPlay}
                isLocked={isLocked}
                displayAnsweredCount={displayAnsweredCount}
                playerCount={playerCount}
                remaining={remaining}
              />
            )}
          </AnimatePresence>

          {/* Scoreboard column */}
          <div className="theater-score-col">
            <div className="theater-col-title">
              <span className="head">Face B · Classement</span>
              <span className="live"><span className="dot" />Live</span>
            </div>
            <div className="flex flex-col gap-1">
              {sortedPlayers.map((p, idx) => {
                const color = playerColor(idx)
                const isMe = p.userId === me
                const isLead = idx === 0
                const statusText = p.disconnected
                  ? "Parti"
                  : isRevealed
                    ? (p.isReady ? "Prêt" : "Regarde")
                    : (p.hasAnswered ? "A répondu" : (isMe && (guessTitle || guessArtist) ? "Écrit..." : "Attend"))
                const statusCls = p.disconnected ? "gone"
                  : isRevealed && p.isReady ? "locked"
                  : !isRevealed && p.hasAnswered ? "locked"
                  : isMe && !p.hasAnswered && (guessTitle || guessArtist) ? "typing"
                  : ""
                return (
                  <motion.div
                    key={p.userId}
                    layout
                    transition={{ type: "spring", stiffness: 240, damping: 26 }}
                    className={`theater-pchip ${isMe ? "you" : ""} ${isLead && p.score > 0 ? "lead" : ""} ${p.disconnected ? "gone" : ""}`}
                    style={{ "--c": color } as CSSProperties}
                  >
                    <div className="pavatar">
                      {p.avatar ? <img src={p.avatar} alt="" /> : initial(p.username)}
                    </div>
                    <div className="pmid">
                      <span className="pname">
                        {p.username || `J${p.userId}`}
                        {isMe && <span className="you-tag">Toi</span>}
                      </span>
                      <span className={`pstatus ${statusCls}`}>
                        <span className="pdot" />{statusText}
                      </span>
                    </div>
                    <span className="pdots" aria-hidden />
                    <div className="pright">
                      <span className="pscore">{p.score}</span>
                      <span className="pscore-label">pts</span>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Chat integre : visible en permanence sous le classement (PC).
                Avant : un tiroir qui recouvrait l'ecran, ferme par defaut. */}
            {onSendChat && (
              <div className="theater-chat-inline">
                <div className="theater-col-title"><span className="head">Chat</span></div>
                <div ref={chatScrollRef} className="theater-chat-body">
                  {chatMessages.length === 0 && (
                    <p className="theater-chat-empty">Aucun message pour l'instant.</p>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i} className="theater-chat-msg">
                      <span className="who" style={{ color: m.userId === me ? TERRA : "#6b573f" }}>{m.username}</span>
                      <span className="txt">{m.message}</span>
                    </div>
                  ))}
                </div>
                <form
                  className="theater-chat-form"
                  onSubmit={e => {
                    e.preventDefault()
                    const txt = chatInput.trim()
                    if (!txt) return
                    onSendChat(txt)
                    setChatInput("")
                  }}
                >
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Dis quelque chose..."
                    maxLength={200}
                    className="theater-input"
                  />
                </form>
              </div>
            )}
          </div>
        </div>

        {/* ====================== BOTTOM DOCK ====================== */}
        {!isRevealed && !isFinished ? (
          <form
            className="theater-dock"
            onSubmit={e => { e.preventDefault(); onSubmit() }}
          >
            <div className="theater-field">
              <label className="theater-flabel">
                Titre
                {guessTitle.trim() && <span className="check">✓</span>}
              </label>
              <input
                value={guessTitle}
                onChange={e => setGuessTitle(e.target.value)}
                disabled={localHasAnswered || disabled}
                className={`theater-input ${guessTitle.trim() ? "filled" : ""}`}
                placeholder="Titre du morceau"
                autoComplete="off"
              />
            </div>

            <div className="theater-field">
              <label className="theater-flabel">
                Artiste
                {guessArtist.trim() && <span className="check">✓</span>}
              </label>
              <input
                value={guessArtist}
                onChange={e => setGuessArtist(e.target.value)}
                disabled={localHasAnswered || disabled}
                className={`theater-input ${guessArtist.trim() ? "filled" : ""}`}
                placeholder="Tape ici..."
                autoComplete="off"
              />
            </div>

            {!state?.singleContributor && (
            <div className="theater-field">
              <label className="theater-flabel">
                Qui a ajouté ?
                <span className="tag">+1 pt</span>
              </label>
              <div className="theater-picker">
                {pickerPlayers.map((p, idx) => {
                  const c = playerColor(idx)
                  const selected = sourceGuess === p.userId
                  return (
                    <button
                      key={p.userId}
                      type="button"
                      disabled={localHasAnswered || disabled}
                      onClick={() => setSourceGuess(selected ? null : p.userId)}
                      className={`theater-pick ${selected ? "selected" : ""}`}
                      style={{ "--c": c } as CSSProperties}
                      title={p.username || `J${p.userId}`}
                    >
                      <span className="pick-avatar">
                        {p.avatar ? <img src={p.avatar} alt="" /> : initial(p.username)}
                      </span>
                      <span className="pick-name">{(p.username || `J${p.userId}`).slice(0, 8)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            )}

            {state?.singleContributor && (
              <p className="text-[11px] italic leading-snug" style={{ color: "#8a7558" }}>
                Une seule playlist en jeu, pas de point « qui a ajouté » cette partie.
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="theater-submit flex-1"
                disabled={localHasAnswered || disabled}
              >
                {localHasAnswered ? "Envoyée" : "Valider ma réponse"}
              </button>
              {/* Personne ne connait ce son : on passe au lieu de regarder le
                  chrono, reveal des que tout le monde a tranche. */}
              <button
                type="button"
                onClick={onPass}
                disabled={localHasAnswered || disabled}
                className="theater-pass"
              >
                Je sais pas
              </button>
            </div>

            <span className="theater-dock-tag-left">Face A · Réponse</span>
            <span className="theater-dock-tag-right">{displayAnsweredCount}/{playerCount} réponses</span>
          </form>
        ) : null}

        {isFinished && (
          <TheaterFinale
            players={sortedPlayers}
            meId={me}
            onRematch={onRematch}
            onExit={onExit}
          />
        )}
      </div>

    </div>
  )
}

/* ============================ GUESSING STAGE ============================ */

function GuessingStage({
  isAudioPhase,
  manualPlayRequired,
  onManualPlay,
  isLocked,
  displayAnsweredCount,
  playerCount,
  remaining,
  needleStage,
  isRevealed,
}: {
  isAudioPhase: boolean
  manualPlayRequired: boolean
  onManualPlay: () => void
  isLocked: boolean
  displayAnsweredCount: number
  playerCount: number
  remaining: number
  needleStage: "raised" | "dropping" | "down"
  isRevealed: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35 }}
      className="theater-show"
    >
      <span className="theater-show-label">
        <span className="bullet" />
        {isLocked ? `Révélation dans ${remaining}s` : "Extrait en cours"}
      </span>

      <div className="theater-arena">
        <div className={`theater-vinyl ${needleStage === "down" && !isRevealed ? "spinning" : ""}`}>
          <div className="theater-gloss" />
          <div className="theater-vinyl-center" />
        </div>
        <div className={`theater-tonearm ${needleStage !== "raised" ? "down" : ""}`}>
          <div className="ta-base" />
          <div className="ta-bar"><div className="ta-head" /></div>
        </div>
        {/* Plus de bouton "cliquer pour lancer" : le son se debloque tout seul (host) ou au
            premier tap n'importe ou (invite) — gere par MultiplayerGameClient. */}
        <span className="theater-arena-hint">33⅓ RPM · Stéréo</span>
      </div>

      <div className="theater-wave">
        {Array.from({ length: 28 }).map((_, i) => (
          <i key={i} style={{ animationDelay: `${(i * 73) % 360}ms` }} />
        ))}
      </div>

      <div className="theater-status-row">
        <span>{displayAnsweredCount}/{playerCount} réponses reçues</span>
      </div>
    </motion.div>
  )
}

/* ============================ REVEAL STAGE ============================ */

function RevealStage({
  currentTrack,
  trackOwnerUsername,
  player,
  revealCountdown,
  onReady,
  readyCount,
  playerCount,
  isFinished,
  onRematch,
}: {
  currentTrack: MultiplayerGameState["currentTrack"] | null
  trackOwnerUsername: string | null
  player: PlayerRow | null
  revealCountdown: number
  onReady: () => void
  readyCount: number
  playerCount: number
  isFinished: boolean
  onRematch?: () => void
}) {
  const verdict = player?.lastVerdict
  const verdictColor = verdict === "correct" ? SAGE : verdict === "close" ? GOLD : "#9c2f1d"
  const verdictLabel = verdict === "correct" ? "Validé" : verdict === "close" ? "Partiel" : "Raté"

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.45 }}
      className="theater-show"
    >
      <span className="theater-show-label" style={{ color: GOLD }}>
        <span className="bullet" style={{ background: GOLD }} />
        Reveal
      </span>

      <div className="theater-reveal-card">
        <div className="theater-reveal-cover">
          {currentTrack?.albumCover ? (
            <img src={currentTrack.albumCover} alt="" />
          ) : (
            <div className="theater-reveal-cover-fallback" />
          )}
        </div>
        <div className="theater-reveal-meta">
          <span className="label">La réponse était</span>
          <h2 className="title">{currentTrack?.title ?? "—"}</h2>
          <p className="artist">{currentTrack?.artist ?? ""}</p>
          {trackOwnerUsername && (
            <p className="owner">
              <span>Ajouté par</span>
              <b>{trackOwnerUsername}</b>
            </p>
          )}
        </div>
      </div>

      {player && (
        <div className="theater-verdict" style={{ borderColor: verdictColor }}>
          <div>
            <span className="label">Ta réponse</span>
            <p>{player.lastGuess || "(pas de réponse)"}</p>
          </div>
          <span className="badge" style={{ color: verdictColor, borderColor: verdictColor }}>{verdictLabel}</span>
        </div>
      )}

      {!isFinished && (
        <button
          className="theater-ready"
          onClick={onReady}
          disabled={Boolean(player?.isReady)}
        >
          {player?.isReady
            ? `En attente (${readyCount}/${playerCount})`
            : `Prêt pour la suite (${revealCountdown}s)`}
        </button>
      )}

      {isFinished && onRematch && (
        <button className="theater-ready" onClick={onRematch}>Rejouer</button>
      )}
    </motion.div>
  )
}

/* ===================== FINALE (fin de partie) ===================== */

function TheaterFinale({
  players,
  meId,
  onRematch,
  onExit,
}: {
  players: PlayerRow[]
  meId: number
  onRematch?: () => void
  onExit?: () => void
}) {
  // Classement : points, puis vitesse cumulee en departage.
  const ranked = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (a.totalReactionMs ?? Infinity) - (b.totalReactionMs ?? Infinity)
  })
  const winner = ranked[0]
  const meWins = winner?.userId === meId
  const initial = (winner?.username || "?").charAt(0).toUpperCase()

  return (
    <motion.div
      className="finale-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45 }}
    >
      <motion.p
        className="finale-label"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <span className="bullet" /> Fin de la face · Résultats
      </motion.p>

      <motion.div
        className="finale-vinyl"
        initial={{ scale: 0.4, opacity: 0, rotate: -120 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ delay: 0.35, type: "spring", stiffness: 120, damping: 14 }}
      >
        <div className="finale-disc">
          <span className="finale-disc-label">{initial}</span>
          <span className="finale-disc-hole" />
        </div>
      </motion.div>

      <motion.h2
        className="finale-winner"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.5 }}
      >
        {winner?.username || "Mystère"}
      </motion.h2>
      <motion.p
        className="finale-sub"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.95 }}
      >
        {winner
          ? winner.score > 0
            ? `${winner.score} ${winner.score > 1 ? "bonnes réponses" : "bonne réponse"} · disque d'or de la session`
            : "Personne n'a marqué. On rejoue ?"
          : ""}
        {meWins && (winner?.score ?? 0) > 0 ? " - et c'est toi." : ""}
      </motion.p>

      <div className="finale-board">
        {ranked.map((p, i) => (
          <motion.div
            key={p.userId}
            className={`finale-row ${i === 0 ? "gold" : ""} ${p.userId === meId ? "me" : ""}`}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.1 + i * 0.14 }}
          >
            <span className="frank">{String(i + 1).padStart(2, "0")}</span>
            <span className="fname">{p.username || `Joueur ${p.userId}`}{p.userId === meId ? " (toi)" : ""}</span>
            <span className="fdots" />
            {Boolean(p.bestStreak && p.bestStreak >= 3) && <span className="fstreak">série x{p.bestStreak}</span>}
            <span className="fscore">{p.score} {p.score > 1 ? "pts" : "pt"}</span>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="finale-actions"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 + ranked.length * 0.14 }}
      >
        {onRematch && <button className="finale-btn primary" onClick={onRematch}>Remettre un disque</button>}
        {onExit && <button className="finale-btn" onClick={onExit}>Retour au lobby</button>}
      </motion.div>
    </motion.div>
  )
}

/* ============================ STYLES ============================ */

const theaterStyles = `
  .theater-root{
    font-family:var(--font-sans, 'Karla'), system-ui, sans-serif;
    --terra:${TERRA}; --gold:${GOLD}; --sage:${SAGE}; --ink:${INK}; --paper:${PAPER};
    --paper-deep:#ece1c8; --well:#efe5d0; --muted:#8a7558; --soft:#6b573f;
    --line:rgba(46,32,20,.22);
  }

  /* Top bar */
  .theater-brand{
    font-family:var(--font-display, 'Fraunces'), serif;
    font-weight:600; font-size:17px; letter-spacing:.02em; color:${INK};
  }
  .theater-brand b{color:${TERRA}; font-weight:700}
  .theater-brand small{
    display:inline-block; margin-left:10px; padding:2px 8px;
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:9px; letter-spacing:.18em; text-transform:uppercase;
    border:1.5px solid ${INK}; border-radius:999px; color:${INK}; background:transparent;
  }
  .theater-pill{
    display:flex; align-items:center; gap:20px;
    padding:9px 24px;
    background:var(--paper-deep);
    border:2px solid ${INK}; border-radius:6px;
    box-shadow:4px 4px 0 rgba(46,32,20,.18);
  }
  .theater-round{
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:var(--muted);
  }
  .theater-round b{color:${INK}}
  .theater-sep{width:2px; height:20px; background:var(--line)}
  .theater-timer{
    font-family:var(--font-display, 'Fraunces'), serif; font-weight:700;
    font-size:30px; color:${INK}; line-height:1;
    letter-spacing:.02em; min-width:44px; text-align:center;
    transition:color .2s;
  }
  .theater-timer.urgent{
    color:${TERRA};
    animation:urgent-pulse .6s ease-in-out infinite;
  }
  @keyframes urgent-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
  .theater-rdots{display:flex; gap:7px}
  .theater-rdot{
    width:18px; height:3px; background:rgba(46,32,20,.15); border-radius:1px;
  }
  .theater-rdot.done{background:${INK}}
  .theater-rdot.current{
    background:${TERRA};
    animation:dot-blink 1.4s ease-in-out infinite;
  }
  @keyframes dot-blink{0%,100%{opacity:.6}50%{opacity:1}}

  .theater-vol{
    width:34px; height:34px;
    display:grid; place-items:center;
    border:1.5px solid ${INK}; border-radius:6px;
    background:var(--paper-deep); cursor:pointer;
    color:var(--soft);
  }
  .theater-vol:hover{color:${TERRA}; border-color:${TERRA}}
  .theater-volume-slider{
    width:80px; height:4px;
    accent-color:${TERRA};
    background:rgba(46,32,20,.18);
    border-radius:2px; cursor:pointer; appearance:none;
  }
  .theater-quit, .theater-chat-btn{
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:10px; letter-spacing:.14em;
    color:${INK}; padding:8px 14px;
    border:1.5px solid ${INK}; border-radius:999px; background:transparent;
    cursor:pointer; text-transform:uppercase;
    display:inline-flex; align-items:center; gap:6px;
    transition:background .15s, color .15s;
  }
  .theater-quit:hover, .theater-chat-btn:hover{background:${INK}; color:${PAPER}}
  .theater-chat-btn .dot{
    width:6px; height:6px; border-radius:50%; background:${TERRA};
    animation:rec 1.2s ease-in-out infinite;
  }
  @keyframes rec{0%,100%{opacity:1}50%{opacity:.3}}

  /* Center stage */
  .theater-show{
    position:relative;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:14px; min-height:0;
  }
  .theater-show-label{
    display:flex; align-items:center; gap:10px;
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:10px; letter-spacing:.3em; text-transform:uppercase;
    color:${TERRA};
  }
  .theater-show-label .bullet{
    width:6px; height:6px; border-radius:50%; background:${TERRA};
    animation:rec 1.2s ease-in-out infinite;
  }

  /* Platine */
  .theater-arena{
    position:relative; aspect-ratio:1/1; max-height:60vh; width:100%; max-width:540px;
    display:grid; place-items:center;
  }
  .theater-arena::before{
    display:none;
  }
  .theater-vinyl{
    position:relative; width:80%; height:80%; border-radius:50%;
    background:repeating-radial-gradient(circle at 50% 50%, #1c130b 0 1.5px, #2a1d10 1.5px 4px);
    border:2px solid #000;
    box-shadow:inset 0 0 34px rgba(0,0,0,.5), 6px 6px 0 rgba(46,32,20,.18);
    z-index:1;
  }
  .theater-vinyl.spinning{ animation:spin 4.5s linear infinite }
  /* label central : pochette teintee + anneau (fini le gros rond plein orange) */
  .theater-vinyl::after{
    content:""; position:absolute; inset:34%; border-radius:50%;
    background:radial-gradient(circle at 35% 30%, #d96a44, ${TERRA} 62%, #a83f24);
    border:2px solid ${INK};
  }
  .theater-vinyl-center{
    position:absolute; left:50%; top:50%; width:12px; height:12px; transform:translate(-50%,-50%);
    border-radius:50%; background:${PAPER}; border:2px solid ${INK}; z-index:3;
  }
  /* anneau imprime sur le label */
  .theater-gloss{
    position:absolute; left:50%; top:50%; width:22%; height:22%; transform:translate(-50%,-50%);
    border-radius:50%; border:1px solid rgba(46,32,20,.4); z-index:2; pointer-events:none;
  }
  @keyframes spin{to{transform:rotate(360deg)}}

  /* Bras de lecture : se POSE sur le sillon a chaque manche (animation de montage) */
  .theater-tonearm{
    position:absolute; top:-4%; right:0%;
    width:46%; height:60%; z-index:4; pointer-events:none;
    transform-origin:88% 10%; transform:rotate(-26deg);
    transition:transform 1.3s cubic-bezier(.34,.02,.2,1);
  }
  .theater-tonearm.down{ transform:rotate(2deg) }
  .theater-tonearm .ta-base{
    position:absolute; top:3%; right:6%;
    width:28px; height:28px; border-radius:50%;
    background:radial-gradient(circle at 35% 30%, #5a4326, ${INK}); border:2px solid ${INK};
    box-shadow:2px 2px 0 rgba(46,32,20,.25); z-index:2;
  }
  .theater-tonearm .ta-bar{
    position:absolute; top:14px; right:15px;
    width:6px; height:86%;
    background:linear-gradient(90deg,#7a6244,#3a2a1a); border-radius:4px;
    transform:rotate(10deg); transform-origin:top center;
  }
  .theater-tonearm .ta-head{
    position:absolute; left:50%; bottom:-14px; transform:translateX(-50%);
    width:22px; height:28px;
    background:${GOLD}; border:2px solid ${INK}; border-radius:3px;
    box-shadow:2px 2px 0 rgba(46,32,20,.2);
  }
  .theater-arena-hint{
    position:absolute; bottom:-2%; left:50%; transform:translateX(-50%);
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:9px; letter-spacing:.2em;
    color:var(--muted); text-transform:uppercase; z-index:5; white-space:nowrap;
  }
  .theater-manual-play{
    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); z-index:5;
    display:flex; flex-direction:column; align-items:center; gap:6px;
    padding:18px 22px;
    border:2px solid ${INK}; border-radius:6px; background:${PAPER};
    color:${TERRA}; cursor:pointer;
    box-shadow:4px 4px 0 ${INK};
    transition:transform .12s, box-shadow .12s;
  }
  .theater-manual-play:hover{transform:translate(calc(-50% + 2px), calc(-50% + 2px)); box-shadow:2px 2px 0 ${INK}}
  .theater-manual-play span{
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:${INK};
  }

  /* Waveform */
  .theater-wave{
    display:flex; align-items:center; gap:3px;
    width:100%; max-width:480px; height:34px; padding:0 8px;
  }
  .theater-wave i{
    flex:1; min-width:2px;
    background:${TERRA};
    border-radius:1px;
    animation:wave-up .9s ease-in-out infinite alternate;
    transform-origin:center;
  }
  .theater-wave i:nth-child(2n){background:${GOLD}}
  .theater-wave i:nth-child(3n){animation-duration:.7s}
  .theater-wave i:nth-child(5n){animation-duration:1.1s}
  .theater-wave i:nth-child(7n){animation-duration:.85s}
  @keyframes wave-up{from{transform:scaleY(.25)}to{transform:scaleY(1)}}

  .theater-status-row{
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:10px; letter-spacing:.2em; text-transform:uppercase;
    color:var(--muted);
  }

  /* Classement (tracklist) */
  .theater-score-col{
    display:flex; flex-direction:column; gap:12px;
    align-self:stretch; padding:6px 0;
  }
  .theater-col-title{
    display:flex; align-items:center; justify-content:space-between;
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:10px; letter-spacing:.28em; text-transform:uppercase;
    color:${TERRA}; padding:0 4px;
  }
  .theater-col-title .live{
    display:flex; align-items:center; gap:6px;
    font-size:9px; color:var(--muted);
  }
  .theater-col-title .live .dot{
    width:5px; height:5px; border-radius:50%; background:${TERRA};
    animation:rec 1.2s ease-in-out infinite;
  }

  .theater-pchip.gone{ opacity:.45; filter:saturate(.4) }
  .theater-pchip .pstatus.gone{ color:#7a1712; font-weight:700 }
  .theater-pchip{
    display:grid;
    grid-template-columns:34px auto 1fr auto;
    gap:10px; align-items:center;
    padding:8px 4px;
    background:transparent;
    border:none;
    border-bottom:2px dotted rgba(46,32,20,.45);
    position:relative;
  }
  .theater-pchip.you .pname{color:${TERRA}}
  .theater-pchip.lead::before{
    content:"A1"; position:absolute; top:50%; left:-22px; transform:translateY(-50%);
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:9px; color:var(--muted);
  }
  .theater-pchip .pavatar{
    width:34px; height:34px; flex-shrink:0;
    display:grid; place-items:center;
    border:2px solid ${INK}; border-radius:50%;
    background:${PAPER};
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:13px; color:var(--c, ${TERRA});
    overflow:hidden;
  }
  .theater-pchip .pavatar img{width:100%; height:100%; object-fit:cover}
  .theater-pchip .pmid{display:flex; flex-direction:column; min-width:0; gap:3px}
  .theater-pchip .pname{
    font-family:var(--font-display, 'Fraunces'), serif; font-weight:600;
    font-size:15px; line-height:1; color:${INK};
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    display:flex; align-items:center; gap:6px;
  }
  .theater-pchip .you-tag{
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:8px; letter-spacing:.14em; text-transform:uppercase;
    color:${PAPER}; padding:1px 6px; background:${TERRA}; border-radius:999px;
  }
  .theater-pchip .pstatus{
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:9px; letter-spacing:.14em;
    color:var(--muted); text-transform:uppercase;
    display:flex; align-items:center; gap:5px;
  }
  .theater-pchip .pstatus.locked{color:${SAGE}}
  .theater-pchip .pstatus .pdot{
    width:5px; height:5px; border-radius:50%; background:rgba(46,32,20,.3);
  }
  .theater-pchip .pstatus.locked .pdot{background:${SAGE}}
  .theater-pchip .pstatus.typing .pdot{background:${GOLD}; animation:rec 1s ease-in-out infinite}
  .theater-pchip .pdots{
    align-self:center; height:0;
    border-bottom:2px dotted rgba(46,32,20,.3);
    transform:translateY(-2px);
  }
  .theater-pchip .pright{display:flex; flex-direction:column; align-items:flex-end; gap:2px}
  .theater-pchip .pscore{
    font-family:var(--font-display, 'Fraunces'), serif;
    font-size:16px; font-weight:700; color:${INK}; line-height:1;
  }
  .theater-pchip.lead .pscore{color:${TERRA}}
  .theater-pchip .pscore-label{
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:8px; letter-spacing:.15em; text-transform:uppercase; color:var(--muted);
  }

  /* Bottom dock */
  .theater-dock{
    display:grid;
    grid-template-columns:1.1fr 1.1fr 1.7fr auto;
    gap:14px; align-items:end;
    padding:18px;
    background:var(--paper-deep);
    border:2px solid ${INK}; border-radius:6px;
    box-shadow:4px 4px 0 rgba(46,32,20,.18);
    position:relative;
  }
  .theater-dock-tag-left{
    position:absolute; top:-9px; left:18px;
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:10px; letter-spacing:.22em; text-transform:uppercase;
    color:${TERRA}; background:var(--paper); padding:0 8px;
  }
  .theater-dock-tag-right{
    position:absolute; top:-9px; right:18px;
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:10px; letter-spacing:.18em; text-transform:uppercase;
    color:var(--muted); background:var(--paper); padding:0 8px;
  }
  .theater-field{display:flex; flex-direction:column; gap:6px; min-width:0}
  .theater-flabel{
    display:flex; align-items:center; gap:8px;
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:10px; letter-spacing:.2em;
    color:var(--muted); text-transform:uppercase;
  }
  .theater-flabel .tag{
    font-size:8px; padding:1px 6px; border-radius:999px;
    background:${GOLD}; color:${INK}; letter-spacing:.14em; font-weight:700;
  }
  .theater-flabel .check{
    width:14px; height:14px; display:grid; place-items:center;
    border:1.5px solid ${SAGE}; border-radius:50%; color:${SAGE}; font-size:9px;
  }
  .theater-input{
    width:100%; background:transparent;
    border:none; border-bottom:2px solid ${INK};
    border-radius:0; padding:8px 2px;
    color:${INK};
    font-family:var(--font-display, 'Fraunces'), serif; font-size:17px;
    outline:none; transition:border-color .2s;
  }
  .theater-input:focus{border-bottom-color:${TERRA}}
  .theater-input.filled{border-bottom-color:${TERRA}}
  .theater-input::placeholder{color:#b3a182; font-style:italic}
  .theater-input:disabled{opacity:.55; cursor:not-allowed}

  .theater-picker{display:flex; gap:6px}
  .theater-pick{
    flex:1; min-width:0;
    display:flex; flex-direction:column; align-items:center; gap:4px;
    padding:7px 6px 6px; border-radius:6px;
    border:1.5px solid var(--line);
    background:transparent;
    cursor:pointer; transition:all .2s; position:relative;
  }
  .theater-pick:hover{border-color:${INK}; transform:translateY(-2px)}
  .theater-pick.selected{
    border-color:${TERRA}; background:rgba(198,81,51,.1);
  }
  .theater-pick.selected::before{
    content:"✓"; position:absolute; top:2px; right:5px;
    font-size:9px; font-weight:700; color:${TERRA};
  }
  .theater-pick:disabled{opacity:.55; cursor:not-allowed}
  .theater-pick .pick-avatar{
    width:26px; height:26px; display:grid; place-items:center;
    border:2px solid ${INK}; border-radius:50%;
    background:${PAPER};
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:11px; color:${INK};
    overflow:hidden;
  }
  .theater-pick.selected .pick-avatar{background:${TERRA}; color:${PAPER}}
  .theater-pick .pick-avatar img{width:100%; height:100%; object-fit:cover}
  .theater-pick .pick-name{
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:9px; letter-spacing:.06em;
    color:var(--soft);
  }

  .theater-pass{
    flex-shrink:0; border:2px solid rgba(46,32,20,.45); background:transparent;
    padding:10px 12px; border-radius:8px; cursor:pointer;
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#6b573f;
    transition:border-color .15s, color .15s;
  }
  .theater-pass:hover{ border-color:#2e2014; color:#2e2014 }
  .theater-pass:disabled{ opacity:.4; cursor:default }
  .theater-submit{
    padding:14px 26px;
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:15px; letter-spacing:.04em;
    background:${TERRA};
    border:2px solid ${INK}; border-radius:6px; color:${PAPER};
    cursor:pointer;
    box-shadow:4px 4px 0 ${INK};
    transition:transform .12s, box-shadow .12s;
    align-self:end; height:fit-content;
    min-width:170px;
  }
  .theater-submit:hover:not(:disabled){transform:translate(2px,2px); box-shadow:2px 2px 0 ${INK}}
  .theater-submit:disabled{
    opacity:.55; cursor:not-allowed;
    background:var(--paper-deep); color:var(--soft);
    box-shadow:none;
  }

  /* Reveal */
  .theater-reveal-card{
    display:flex; gap:24px; align-items:center;
    padding:24px;
    background:var(--paper-deep); border:2px solid ${INK}; border-radius:6px;
    box-shadow:4px 4px 0 rgba(46,32,20,.18);
    max-width:560px; width:100%;
  }
  .theater-reveal-cover{
    width:140px; height:140px; flex-shrink:0;
    border:2px solid ${INK};
    overflow:hidden; background:var(--well);
    box-shadow:4px 4px 0 rgba(46,32,20,.18);
  }
  .theater-reveal-cover img{width:100%; height:100%; object-fit:cover}
  .theater-reveal-cover-fallback{
    width:100%; height:100%;
    background:repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px);
  }
  .theater-reveal-meta{display:flex; flex-direction:column; gap:6px; min-width:0}
  .theater-reveal-meta .label{
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:9px; letter-spacing:.3em; text-transform:uppercase;
    color:${TERRA};
  }
  .theater-reveal-meta .title{
    font-family:var(--font-display, 'Fraunces'), serif; font-weight:600;
    font-size:32px; line-height:1.1; color:${INK};
  }
  .theater-reveal-meta .artist{
    font-size:16px; color:var(--soft);
  }
  .theater-reveal-meta .owner{
    display:flex; align-items:center; gap:8px; margin-top:8px;
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:10px; letter-spacing:.16em; text-transform:uppercase;
    color:var(--muted);
  }
  .theater-reveal-meta .owner b{color:${TERRA}}

  .theater-verdict{
    display:flex; align-items:center; justify-content:space-between; gap:14px;
    padding:14px 18px;
    background:var(--well);
    border:2px solid; border-radius:6px;
    max-width:560px; width:100%;
  }
  .theater-verdict .label{
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:9px; letter-spacing:.24em;
    color:var(--muted); text-transform:uppercase;
    display:block; margin-bottom:4px;
  }
  .theater-verdict p{font-size:15px; color:${INK}; font-family:var(--font-display, 'Fraunces'), serif}
  .theater-verdict .badge{
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:11px; padding:6px 14px; border-radius:999px;
    border:1.5px solid currentColor; letter-spacing:.14em; text-transform:uppercase;
  }

  .theater-ready{
    padding:14px 28px;
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:14px; letter-spacing:.04em;
    background:${INK};
    border:2px solid ${INK}; border-radius:6px; color:${PAPER};
    cursor:pointer;
    box-shadow:4px 4px 0 rgba(46,32,20,.3);
    transition:transform .12s, box-shadow .12s;
  }
  .theater-ready:hover:not(:disabled){
    transform:translate(2px,2px); box-shadow:2px 2px 0 rgba(46,32,20,.3);
  }
  .theater-ready:disabled{
    opacity:.7; cursor:not-allowed;
    background:var(--paper-deep); color:var(--soft); box-shadow:none;
  }

  .theater-finished{
    display:flex; align-items:center; gap:12px;
    padding:14px 20px;
    background:var(--paper-deep); border:2px solid ${INK}; border-radius:6px;
    font-family:var(--font-display, 'Fraunces'), serif; font-weight:600;
    font-size:17px; color:${INK};
    box-shadow:4px 4px 0 rgba(46,32,20,.18);
  }

  /* Chat drawer */
  .theater-chat-inline{
    display:flex; flex-direction:column; flex:1; min-height:120px;
    margin-top:4px; border:2px solid ${INK}; border-radius:8px;
    background:rgba(236,225,200,.55); overflow:hidden;
  }
  .theater-chat-inline .theater-col-title{ padding:6px 10px 0 }
  .theater-chat-inline .theater-chat-body{ flex:1; min-height:0; overflow-y:auto; padding:6px 10px }
  .theater-chat-inline .theater-chat-form{ padding:6px; border-top:1.5px solid rgba(46,32,20,.25) }
  .theater-chat-drawer{
    position:fixed; top:0; right:0; bottom:0; width:min(340px, 90vw); z-index:60;
    display:flex; flex-direction:column;
    background:${PAPER};
    border-left:2px solid ${INK};
    box-shadow:-8px 0 0 rgba(46,32,20,.12);
  }
  .theater-chat-head{
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 16px; border-bottom:2px solid ${INK};
    font-family:var(--font-sans, 'Karla'), sans-serif; font-weight:700;
    font-size:11px; letter-spacing:.2em; text-transform:uppercase;
    color:${TERRA};
  }
  .theater-chat-body{
    flex:1; overflow:auto; padding:12px 16px;
    display:flex; flex-direction:column; gap:8px;
  }
  .theater-chat-empty{
    font-size:13px; font-style:italic;
    font-family:var(--font-display, 'Fraunces'), serif;
    color:var(--muted); text-align:center; padding:20px 0;
  }
  .theater-chat-msg{font-size:13px; line-height:1.45}
  .theater-chat-msg .who{
    font-weight:700; font-size:12px;
    margin-right:6px;
  }
  .theater-chat-msg .txt{color:${INK}}
  .theater-chat-form{padding:12px 16px; border-top:1.5px solid var(--line)}

  /* Responsive */
  @media (max-width:1180px){
    .theater-stage{padding:14px 16px 16px}
    .theater-stage > div:nth-child(2){grid-template-columns:1fr 260px !important; gap:20px !important}
  }
  /* ---------- Finale ---------- */
  .finale-overlay{
    position:fixed; inset:0; z-index:80;
    background:${PAPER};
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:10px; padding:28px 20px; overflow-y:auto;
  }
  .finale-label{
    display:flex; align-items:center; gap:10px;
    font-family:var(--font-sans,'Karla'),sans-serif; font-weight:700;
    font-size:11px; letter-spacing:.3em; text-transform:uppercase; color:${TERRA};
  }
  .finale-label .bullet{width:6px; height:6px; border-radius:50%; background:${TERRA}; animation:rec 1.2s ease-in-out infinite}
  .finale-vinyl{margin-top:6px}
  .finale-disc{
    position:relative; width:128px; height:128px; border-radius:50%;
    background:repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px);
    border:3px solid ${INK}; box-shadow:6px 6px 0 rgba(46,32,20,.18);
    animation:vinyl-spin 8s linear infinite;
    display:grid; place-items:center;
  }
  .finale-disc-label{
    position:absolute; inset:30%; border-radius:50%;
    background:${GOLD}; border:3px solid ${INK};
    display:grid; place-items:center;
    font-family:var(--font-display,'Fraunces'),serif; font-weight:700; font-size:28px; color:${INK};
  }
  .finale-disc-hole{position:absolute; inset:46%; border-radius:50%; background:${PAPER}; border:2px solid ${INK}; z-index:2}
  .finale-winner{
    margin:8px 0 0;
    font-family:var(--font-display,'Fraunces'),serif; font-weight:700;
    font-size:clamp(2rem, 7vw, 3.4rem); line-height:1.05; color:${INK};
    text-align:center; max-width:90vw; overflow-wrap:anywhere;
  }
  .finale-sub{
    margin:0; font-size:14px; color:#6b573f; text-align:center;
  }
  .finale-board{
    margin-top:18px; width:100%; max-width:460px;
    display:flex; flex-direction:column; gap:8px;
  }
  .finale-row{
    display:flex; align-items:baseline; gap:10px;
    padding:9px 14px; border-radius:6px;
    border:1.5px solid var(--line); background:var(--paper-deep);
  }
  .finale-row.gold{border:2px solid ${INK}; background:${GOLD}22; box-shadow:4px 4px 0 rgba(46,32,20,.16)}
  .finale-row.me .fname{color:${TERRA}}
  .finale-row .frank{font-family:var(--font-sans,'Karla'),sans-serif; font-weight:700; font-size:11px; color:var(--muted); min-width:22px}
  .finale-row .fname{font-family:var(--font-display,'Fraunces'),serif; font-weight:600; font-size:17px; color:${INK}; overflow-wrap:anywhere}
  .finale-row .fdots{flex:1; border-bottom:2px dotted rgba(46,32,20,.4); transform:translateY(-4px); min-width:18px}
  .finale-row .fstreak{font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:${TERRA}}
  .finale-row .fscore{font-family:var(--font-display,'Fraunces'),serif; font-weight:700; font-size:17px; color:${INK}}
  .finale-actions{display:flex; gap:10px; margin-top:20px; flex-wrap:wrap; justify-content:center}
  .finale-btn{
    font-family:var(--font-sans,'Karla'),sans-serif; font-weight:700; font-size:13px;
    padding:13px 24px; border-radius:6px; cursor:pointer;
    border:2px solid ${INK}; background:transparent; color:${INK};
    transition:transform .12s, box-shadow .12s;
  }
  .finale-btn.primary{
    background:${TERRA}; color:${PAPER}; box-shadow:4px 4px 0 ${INK};
  }
  .finale-btn.primary:hover{transform:translate(2px,2px); box-shadow:2px 2px 0 ${INK}}
  .finale-btn:not(.primary):hover{background:${INK}; color:${PAPER}}

  @media (max-width:900px){
    .theater-stage > div:nth-child(2){grid-template-columns:1fr !important}
    .theater-score-col{display:none}
    .theater-dock{grid-template-columns:1fr 1fr !important}
    .theater-dock > .theater-field:nth-child(3){grid-column:1 / -1}
    .theater-submit{grid-column:1 / -1; width:100%}
  }

  /* ===== Téléphone : le chrono + les 3 champs doivent tenir SANS scroller.
     On bride la platine pour laisser la place au dock de réponse. ===== */
  @media (max-width:640px){
    .theater-stage{padding:8px 12px 12px !important; gap:8px !important; overflow-x:hidden}
    /* Top bar : sur telephone le slider + CHAT + Quitter debordaient (contenu plus large
       que l'ecran). On reduit le gap, masque le slider et le CHAT (secondaire), compacte Quitter. */
    .theater-topbar{gap:8px !important; grid-template-columns:auto 1fr auto !important}
    .theater-volume-slider{display:none}
    .theater-chat-btn{display:none}
    .theater-vol{width:30px; height:30px}
    .theater-quit{font-size:11px; padding:5px 9px}
    .theater-brand{font-size:14px}
    .theater-brand small{display:none}
    .theater-pill{gap:12px; padding:7px 14px}
    .theater-timer{font-size:24px; min-width:36px}
    .theater-rdots{display:none}
    .theater-show{gap:8px}
    .theater-arena{max-height:30vh; max-width:62vw}
    .theater-status-row{font-size:11px}
    .theater-wave{display:none}
    .theater-dock{grid-template-columns:1fr !important; padding:12px !important; gap:10px !important}
    .theater-dock > .theater-field{grid-column:1 / -1}
    .theater-dock-tag-left, .theater-dock-tag-right{display:none}
    .theater-input{font-size:16px}
    .theater-picker{gap:8px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none}
    .theater-picker::-webkit-scrollbar{display:none}
    .theater-picker::after{content:""; position:sticky; right:0; flex:0 0 28px; margin-left:-28px; align-self:stretch; background:linear-gradient(to right, transparent, var(--paper-deep)); pointer-events:none}
    .theater-pick{flex:0 0 auto; min-width:62px; padding:8px 8px 7px}
    .theater-pick .pick-avatar{width:38px; height:38px; font-size:14px}
    .theater-pick .pick-name{font-size:10px}
    .theater-submit{padding:14px; font-size:14px}
    .theater-reveal-card{flex-direction:column; text-align:center; gap:14px}
    .theater-reveal-cover{width:120px; height:120px}
    .finale-disc{width:104px; height:104px}
    .finale-board{max-width:100%}
  }
`
