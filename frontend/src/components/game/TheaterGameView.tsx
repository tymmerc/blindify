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
}

type UiPhase = "guessing" | "locked" | "reveal"

type Props = {
  user: UserSummary
  state: MultiplayerGameState | null
  uiPhase: UiPhase
  isPlaying: boolean
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

const PINK = "#ff2ec8"
const CYAN = "#00f7ff"
const YELLOW = "#ffea00"
const PURPLE = "#a855f7"

const playerColor = (idx: number) => [CYAN, PINK, PURPLE, YELLOW][idx % 4]

const initial = (name: string | null | undefined) =>
  (name && name.trim()[0]?.toUpperCase()) || "?"

export function TheaterGameView(props: Props) {
  const {
    user, state, uiPhase, isPlaying, isLocked, isRevealed,
    remaining, totalSeconds, sortedPlayers, displayAnsweredCount, playerCount, readyCount,
    guessTitle, setGuessTitle, guessArtist, setGuessArtist, sourceGuess, setSourceGuess,
    localHasAnswered, onSubmit, disabled,
    muted, volume, onToggleMute, onVolumeChange,
    manualPlayRequired, isAudioPhase, onManualPlay,
    currentTrack, trackOwnerUsername, player, revealCountdown,
    onReady, onRematch, onExit,
    chatMessages, chatInput, setChatInput, onSendChat, chatScrollRef,
  } = props

  const currentRound = state?.currentRound ?? 0
  const totalRounds = state?.totalRounds ?? 10
  const isFinished = state?.phase === "FINISHED"

  const dots = useMemo(
    () => Array.from({ length: Math.max(1, totalRounds) }, (_, i) => i + 1),
    [totalRounds]
  )

  const timerUrgent = isPlaying && remaining <= 10 && remaining > 0
  const timerLabel = isPlaying ? String(remaining).padStart(2, "0") : isLocked ? "--" : "GO"

  const verdictTone = (v: string | null | undefined) =>
    v === "correct" ? "#00ff9d" : v === "close" ? YELLOW : "#ff4d6d"
  const verdictLabel = (v: string | null | undefined) =>
    v === "correct" ? "Valide" : v === "close" ? "Partiel" : "Rate"

  const me = user.id

  // Cover background uses current track album cover if available (blurred). Fallback to gradient.
  const coverUrl = currentTrack?.albumCover ?? null
  const bgStyle: CSSProperties = coverUrl
    ? { backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : {}

  const [showChat, setShowChat] = useState(false)
  const chatBtnRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="theater-root relative min-h-screen overflow-hidden" style={{ background: "#0a0014", color: "#f5e8ff" }}>
      <style jsx global>{theaterStyles}</style>

      {/* Background: blurred album cover or fallback gradients */}
      <div className="theater-cover-bg" style={bgStyle} aria-hidden />
      {!coverUrl && <div className="theater-cover-fallback" aria-hidden />}
      <div className="theater-horizon" aria-hidden>
        <div className="theater-horizon-grid" />
      </div>
      <div className="theater-vignette" aria-hidden />
      <div className="theater-grain" aria-hidden />
      <div className="theater-beam" aria-hidden />
      <div className="theater-scanlines" aria-hidden />

      <div className="theater-stage relative z-[3] grid h-screen px-6 pt-4 pb-5 gap-2" style={{ gridTemplateRows: "auto 1fr auto" }}>

        {/* ====================== TOP BAR ====================== */}
        <div className="grid items-center gap-4" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
          <div className="theater-brand">
            <b>BLIND</b>IFY
            <small>FRIENDS · LIVE</small>
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
            {onSendChat && (
              <button
                ref={chatBtnRef}
                className={`theater-chat-btn ${chatMessages.length > 0 ? "has-msg" : ""}`}
                onClick={() => setShowChat(s => !s)}
              >
                // CHAT
                {chatMessages.length > 0 && <span className="dot" />}
              </button>
            )}
            {onExit && (
              <button className="theater-quit" onClick={onExit}>// QUITTER</button>
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
              <span className="head">SCOREBOARD</span>
              <span className="live"><span className="dot" />LIVE</span>
            </div>
            <div className="flex flex-col gap-3">
              {sortedPlayers.map((p, idx) => {
                const color = playerColor(idx)
                const isMe = p.userId === me
                const isLead = idx === 0
                const statusText = isRevealed
                  ? (p.isReady ? "READY" : "WATCHING")
                  : (p.hasAnswered ? "LOCKED" : (isMe && (guessTitle || guessArtist) ? "TYPING..." : "WAITING"))
                const statusCls = isRevealed && p.isReady ? "locked"
                  : !isRevealed && p.hasAnswered ? "locked"
                  : isMe && !p.hasAnswered && (guessTitle || guessArtist) ? "typing"
                  : ""
                return (
                  <motion.div
                    key={p.userId}
                    layout
                    transition={{ type: "spring", stiffness: 240, damping: 26 }}
                    className={`theater-pchip ${isMe ? "you" : ""} ${isLead && p.score > 0 ? "lead" : ""}`}
                    style={{ "--c": color } as CSSProperties}
                  >
                    <div className="pavatar">
                      {p.avatar ? <img src={p.avatar} alt="" /> : initial(p.username)}
                    </div>
                    <div className="pmid">
                      <span className="pname">
                        {p.username || `J${p.userId}`}
                        {isMe && <span className="you-tag">YOU</span>}
                      </span>
                      <span className={`pstatus ${statusCls}`}>
                        <span className="pdot" />{statusText}
                      </span>
                    </div>
                    <div className="pright">
                      <span className="pscore">{p.score}</span>
                      <span className="pscore-label">PTS</span>
                    </div>
                  </motion.div>
                )
              })}
            </div>
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

            <div className="theater-field">
              <label className="theater-flabel">
                Qui a ajoute ?
                <span className="tag">+30 PTS</span>
              </label>
              <div className="theater-picker">
                {sortedPlayers.map((p, idx) => {
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
                      <span className="pick-name">{(p.username || `J${p.userId}`).slice(0, 8).toUpperCase()}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              type="submit"
              className="theater-submit"
              disabled={localHasAnswered || disabled}
            >
              {localHasAnswered ? "> LOCKED" : "> VALIDER"}
            </button>

            <span className="theater-dock-tag-left">[ INPUT_DECK ]</span>
            <span className="theater-dock-tag-right">// {displayAnsweredCount}/{playerCount} LOCKED</span>
          </form>
        ) : null}

        {isFinished && (
          <div className="theater-finished">
            <Trophy className="w-5 h-5" style={{ color: YELLOW }} />
            <span>PARTIE TERMINEE</span>
            <div className="flex gap-2 ml-auto">
              {onRematch && <button className="theater-quit" onClick={onRematch}>// REJOUER</button>}
              {onExit && <button className="theater-quit" onClick={onExit}>// LOBBY</button>}
            </div>
          </div>
        )}
      </div>

      {/* Chat drawer */}
      {onSendChat && (
        <AnimatePresence>
          {showChat && (
            <motion.aside
              key="chat"
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="theater-chat-drawer"
            >
              <div className="theater-chat-head">
                <span>[ LOBBY_CHAT ]</span>
                <button onClick={() => setShowChat(false)} className="theater-quit">// CLOSE</button>
              </div>
              <div ref={chatScrollRef} className="theater-chat-body">
                {chatMessages.length === 0 && (
                  <p className="theater-chat-empty">&gt; aucun_message_en_cours_</p>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className="theater-chat-msg">
                    <span className="who" style={{ color: m.userId === me ? CYAN : PINK }}>{m.username}</span>
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
                  placeholder="> dis quelque chose..."
                  maxLength={200}
                  className="theater-input"
                />
              </form>
            </motion.aside>
          )}
        </AnimatePresence>
      )}
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
}: {
  isAudioPhase: boolean
  manualPlayRequired: boolean
  onManualPlay: () => void
  isLocked: boolean
  displayAnsweredCount: number
  playerCount: number
  remaining: number
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
        {isLocked ? `REVEAL DANS ${remaining}S` : "REC · EXTRAIT EN COURS"}
      </span>

      <div className="theater-arena">
        <div className="theater-vinyl">
          <div className="theater-gloss" />
          <div className="theater-vinyl-center" />
        </div>
        <div className="theater-tonearm">
          <div className="ta-base" />
          <div className="ta-bar" />
          <div className="ta-head" />
        </div>
        {manualPlayRequired && isAudioPhase && (
          <button onClick={onManualPlay} className="theater-manual-play" title="Lancer la musique">
            <Play className="w-7 h-7" />
            <span>CLIQUER POUR LANCER</span>
          </button>
        )}
        <span className="theater-arena-hint">DRAG TO SPIN FASTER</span>
      </div>

      <div className="theater-wave">
        {Array.from({ length: 28 }).map((_, i) => (
          <i key={i} style={{ animationDelay: `${(i * 73) % 360}ms` }} />
        ))}
      </div>

      <div className="theater-status-row">
        <span>// {displayAnsweredCount}/{playerCount} LOCKED IN</span>
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
  const verdictColor = verdict === "correct" ? "#00ff9d" : verdict === "close" ? YELLOW : "#ff4d6d"
  const verdictLabel = verdict === "correct" ? "VALIDE" : verdict === "close" ? "PARTIEL" : "RATE"

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.45 }}
      className="theater-show"
    >
      <span className="theater-show-label" style={{ color: YELLOW, textShadow: `0 0 6px ${YELLOW}` }}>
        <span className="bullet" style={{ background: YELLOW, boxShadow: `0 0 8px ${YELLOW}` }} />
        REVEAL
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
          <span className="label">LA REPONSE ETAIT</span>
          <h2 className="title">{currentTrack?.title ?? "—"}</h2>
          <p className="artist">{currentTrack?.artist ?? ""}</p>
          {trackOwnerUsername && (
            <p className="owner">
              <span>AJOUTE PAR</span>
              <b>{trackOwnerUsername}</b>
            </p>
          )}
        </div>
      </div>

      {player && (
        <div className="theater-verdict" style={{ borderColor: verdictColor, boxShadow: `0 0 20px ${verdictColor}40` }}>
          <div>
            <span className="label">TA REPONSE</span>
            <p>{player.lastGuess || "(pas de reponse)"}</p>
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
            ? `// EN ATTENTE (${readyCount}/${playerCount})`
            : `> PRET POUR LA SUITE (${revealCountdown}S)`}
        </button>
      )}

      {isFinished && onRematch && (
        <button className="theater-ready" onClick={onRematch}>&gt; REJOUER</button>
      )}
    </motion.div>
  )
}

/* ============================ STYLES ============================ */

const theaterStyles = `
  .theater-root{
    font-family:'Space Grotesk', system-ui, sans-serif;
    --pink:${PINK}; --cyan:${CYAN}; --yellow:${YELLOW}; --purple:${PURPLE};
    --bg:#0a0014;
  }
  .theater-cover-bg{
    position:fixed; inset:-12%; z-index:0;
    filter:blur(56px) saturate(1.45) brightness(.85);
    transform:scale(1.08);
    animation:cover-drift 26s ease-in-out infinite alternate;
  }
  .theater-cover-fallback{
    position:fixed; inset:-12%; z-index:0;
    background:
      radial-gradient(ellipse 80% 60% at 32% 28%, #ff1f9a 0%, transparent 35%),
      radial-gradient(ellipse 60% 80% at 78% 30%, #2300a8 0%, transparent 45%),
      radial-gradient(ellipse 70% 90% at 22% 72%, #4a00d4 0%, transparent 50%),
      radial-gradient(ellipse 90% 50% at 80% 78%, #ff7a00 0%, transparent 40%),
      radial-gradient(circle at 50% 50%, #1e0048 0%, #08000f 80%),
      #0a0014;
    filter:blur(56px) saturate(1.45) brightness(.9);
    transform:scale(1.08);
    animation:cover-drift 26s ease-in-out infinite alternate;
  }
  @keyframes cover-drift{
    0%{transform:scale(1.08) translate(0,0)}
    100%{transform:scale(1.12) translate(-22px,18px) rotate(.5deg)}
  }
  .theater-horizon{
    position:fixed; left:0; right:0; bottom:0; height:38vh; z-index:1;
    pointer-events:none; opacity:.45;
  }
  .theater-horizon::before{
    content:""; position:absolute; left:0; right:0; bottom:32vh;
    height:1px; background:linear-gradient(90deg, transparent, ${PINK} 30%, ${CYAN} 70%, transparent);
    box-shadow:0 0 18px ${PINK}, 0 0 32px ${PINK}80;
    filter:blur(.4px);
  }
  .theater-horizon::after{
    content:""; position:absolute; left:50%; transform:translateX(-50%);
    bottom:24vh; width:280px; height:280px; border-radius:50%;
    background:radial-gradient(circle, ${PINK}70 0%, ${PURPLE}30 40%, transparent 65%);
    filter:blur(8px);
  }
  .theater-horizon-grid{
    position:absolute; left:0; right:0; bottom:0; top:32vh;
    background-image:
      linear-gradient(${PINK}30 1px, transparent 1px),
      linear-gradient(90deg, ${CYAN}30 1px, transparent 1px);
    background-size:60px 60px;
    transform:perspective(380px) rotateX(62deg);
    transform-origin:center top;
    mask-image:linear-gradient(to top, rgba(0,0,0,.6) 30%, transparent 95%);
    animation:grid-pan 22s linear infinite;
  }
  @keyframes grid-pan{from{background-position:0 0,0 0}to{background-position:0 60px,60px 0}}
  .theater-vignette{
    position:fixed; inset:0; z-index:2; pointer-events:none;
    background:
      radial-gradient(circle at 50% 45%, transparent 18%, rgba(10,0,20,.6) 65%, rgba(10,0,20,.98) 100%),
      linear-gradient(180deg, rgba(10,0,20,.45) 0%, transparent 25%, transparent 70%, rgba(10,0,20,.75) 100%);
  }
  .theater-grain{
    position:fixed; inset:0; z-index:48; pointer-events:none; opacity:.04;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    mix-blend-mode:overlay;
  }
  .theater-scanlines{
    position:fixed; inset:0; z-index:49; pointer-events:none;
    background:repeating-linear-gradient(180deg, rgba(0,0,0,0) 0, rgba(0,0,0,0) 2px, rgba(0,0,0,.32) 3px, rgba(0,0,0,0) 4px);
    mix-blend-mode:multiply; opacity:.5;
  }
  .theater-beam{
    position:fixed; left:0; right:0; height:140px; z-index:50; pointer-events:none;
    background:linear-gradient(180deg, transparent 0%, rgba(255,255,255,.04) 50%, transparent 100%);
    transform:translateY(-140px);
    animation:beam 9s linear infinite;
  }
  @keyframes beam{0%{transform:translateY(-140px)}100%{transform:translateY(100vh)}}

  /* Top bar */
  .theater-brand{
    font-family:var(--font-display, 'Audiowide'), sans-serif;
    font-size:15px; letter-spacing:.18em; color:#fff; text-shadow:0 0 8px ${PINK};
  }
  .theater-brand b{color:${PINK}}
  .theater-brand small{
    display:inline-block; margin-left:10px; padding:2px 7px;
    font-family:'JetBrains Mono', monospace; font-size:9px; letter-spacing:.18em;
    border:1px solid ${PINK}66; color:${PINK}; background:${PINK}11;
  }
  .theater-pill{
    display:flex; align-items:center; gap:20px;
    padding:9px 24px;
    background:rgba(10,0,20,.82);
    border:1px solid ${PINK}59;
    backdrop-filter:blur(20px);
    box-shadow:0 0 28px ${PINK}30, inset 0 0 22px ${PURPLE}1f;
    clip-path:polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
  }
  .theater-round{
    font-family:'JetBrains Mono', monospace; font-size:11px; letter-spacing:.28em; color:rgba(245,232,255,.7);
  }
  .theater-round b{color:${CYAN}; text-shadow:0 0 6px ${CYAN}}
  .theater-sep{width:1px; height:20px; background:rgba(255,255,255,.18)}
  .theater-timer{
    font-family:var(--font-display, 'Audiowide'), sans-serif;
    font-size:28px; color:${YELLOW}; line-height:1;
    text-shadow:0 0 12px ${YELLOW}, 0 0 28px ${YELLOW}99;
    letter-spacing:.04em; min-width:44px; text-align:center;
    transition:color .2s, text-shadow .2s;
  }
  .theater-timer.urgent{
    color:#ff4d6d;
    text-shadow:0 0 14px #ff4d6d, 0 0 30px rgba(255,77,109,.7);
    animation:urgent-pulse .6s ease-in-out infinite;
  }
  @keyframes urgent-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
  .theater-rdots{display:flex; gap:7px}
  .theater-rdot{
    width:18px; height:3px; background:rgba(255,255,255,.08); border-radius:1px;
  }
  .theater-rdot.done{background:${CYAN}; box-shadow:0 0 6px ${CYAN}}
  .theater-rdot.current{
    background:linear-gradient(90deg, ${CYAN}, ${YELLOW});
    box-shadow:0 0 8px ${YELLOW};
    animation:dot-glow 1.4s ease-in-out infinite;
  }
  @keyframes dot-glow{0%,100%{opacity:.7}50%{opacity:1}}

  .theater-vol{
    width:34px; height:34px;
    display:grid; place-items:center;
    border:1px solid rgba(255,255,255,.18);
    background:rgba(10,0,20,.6); cursor:pointer;
    color:rgba(245,232,255,.7);
  }
  .theater-vol:hover{border-color:${CYAN}; color:${CYAN}}
  .theater-volume-slider{
    width:80px; height:4px;
    accent-color:${CYAN};
    background:rgba(255,255,255,.08);
    border-radius:2px; cursor:pointer; appearance:none;
  }
  .theater-quit, .theater-chat-btn{
    font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:.22em;
    color:rgba(245,232,255,.6); padding:8px 14px;
    border:1px solid rgba(255,255,255,.18); background:rgba(10,0,20,.6);
    cursor:pointer; text-transform:uppercase;
    display:inline-flex; align-items:center; gap:6px;
  }
  .theater-quit:hover, .theater-chat-btn:hover{color:${CYAN}; border-color:${CYAN}}
  .theater-chat-btn .dot{
    width:6px; height:6px; border-radius:50%; background:${PINK}; box-shadow:0 0 6px ${PINK};
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
    font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:.4em;
    color:${CYAN}cc; text-shadow:0 0 6px ${CYAN}80;
  }
  .theater-show-label .bullet{
    width:6px; height:6px; border-radius:50%; background:${CYAN};
    box-shadow:0 0 8px ${CYAN};
    animation:rec 1.2s ease-in-out infinite;
  }

  /* Vinyl */
  .theater-arena{
    position:relative; aspect-ratio:1/1; max-height:60vh; width:100%; max-width:540px;
    display:grid; place-items:center;
  }
  .theater-arena::before{
    content:""; position:absolute; inset:-14%;
    background:radial-gradient(circle, ${CYAN}73 0%, ${PINK}47 35%, transparent 65%);
    filter:blur(22px); z-index:0;
    animation:pulse-glow 3.2s ease-in-out infinite;
  }
  @keyframes pulse-glow{0%,100%{opacity:.65; transform:scale(1)}50%{opacity:1; transform:scale(1.07)}}
  .theater-vinyl{
    position:relative; width:78%; height:78%; border-radius:50%;
    background:
      conic-gradient(from 0deg, rgba(255,255,255,.06) 0deg, transparent 8deg, transparent 352deg, rgba(255,255,255,.06) 360deg),
      radial-gradient(circle at 50% 50%, #160024 0%, #06000c 70%);
    box-shadow:
      0 0 0 1px ${CYAN}59,
      0 0 90px ${CYAN}73,
      0 0 160px ${PINK}59,
      inset 0 0 120px ${PURPLE}2e;
    animation:spin 14s linear infinite;
    cursor:grab; z-index:1;
  }
  .theater-vinyl::before{
    content:""; position:absolute; inset:6%; border-radius:50%;
    background:repeating-radial-gradient(circle at 50% 50%, transparent 0, transparent 4px, rgba(255,255,255,.045) 5px, transparent 6px);
    mix-blend-mode:screen;
  }
  .theater-vinyl::after{
    content:""; position:absolute; inset:26%; border-radius:50%;
    background:
      radial-gradient(circle at 30% 35%, #ff1f9a 0%, transparent 45%),
      radial-gradient(circle at 70% 65%, ${CYAN} 0%, transparent 45%),
      radial-gradient(circle at 50% 50%, ${PURPLE} 0%, transparent 60%),
      #1a0030;
    filter:blur(10px) saturate(1.6);
    box-shadow:inset 0 0 50px rgba(0,0,0,.6);
  }
  .theater-vinyl-center{
    position:absolute; inset:46%; border-radius:50%;
    background:#0a0014; border:1.5px solid ${CYAN};
    box-shadow:0 0 14px ${CYAN}, 0 0 32px ${CYAN};
    z-index:3;
  }
  .theater-vinyl-center::after{
    content:""; position:absolute; inset:32%; border-radius:50%;
    background:radial-gradient(circle, ${CYAN}, #1a0030);
  }
  .theater-gloss{
    position:absolute; inset:11%; border-radius:50%;
    background:linear-gradient(115deg, rgba(255,255,255,.18) 0%, rgba(255,255,255,.04) 20%, transparent 45%);
    pointer-events:none; z-index:2; mix-blend-mode:overlay;
  }
  @keyframes spin{to{transform:rotate(360deg)}}

  /* Tonearm */
  .theater-tonearm{
    position:absolute; top:-2%; right:-4%;
    width:40%; height:40%; z-index:4; pointer-events:none;
  }
  .theater-tonearm .ta-base{
    position:absolute; top:6%; right:6%;
    width:36px; height:36px; border-radius:50%;
    background:linear-gradient(135deg, #2a1f3d, #14081e);
    box-shadow:inset 0 0 8px rgba(255,255,255,.1), 0 0 12px rgba(0,0,0,.5), 0 0 16px ${CYAN}59;
    border:1px solid ${CYAN}66;
  }
  .theater-tonearm .ta-base::after{
    content:""; position:absolute; inset:30%; border-radius:50%;
    background:radial-gradient(circle, ${CYAN}, #06000c);
    box-shadow:0 0 8px ${CYAN};
  }
  .theater-tonearm .ta-bar{
    position:absolute; top:14%; right:18%;
    width:6px; height:78%;
    background:linear-gradient(180deg, #6a4a8c, #2a1f3d);
    border-left:1px solid rgba(255,255,255,.18);
    border-right:1px solid rgba(0,0,0,.4);
    transform:rotate(-25deg); transform-origin:top center;
    box-shadow:0 0 6px ${PURPLE}4d;
  }
  .theater-tonearm .ta-head{
    position:absolute; bottom:14%; left:24%;
    width:24px; height:14px;
    background:linear-gradient(180deg, #3a2a52, #16091f);
    border:1px solid ${CYAN}80;
    box-shadow:0 0 8px ${CYAN}4d;
    transform:rotate(-25deg);
  }
  .theater-tonearm .ta-head::after{
    content:""; position:absolute; bottom:-3px; left:30%;
    width:2px; height:6px;
    background:${CYAN};
    box-shadow:0 0 6px ${CYAN};
  }
  .theater-arena-hint{
    position:absolute; bottom:-2%; left:50%; transform:translateX(-50%);
    font-family:'JetBrains Mono', monospace; font-size:9px; letter-spacing:.25em;
    color:rgba(245,232,255,.4); text-transform:uppercase; z-index:5; white-space:nowrap;
  }
  .theater-manual-play{
    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); z-index:5;
    display:flex; flex-direction:column; align-items:center; gap:6px;
    padding:18px 22px;
    border:2px solid ${YELLOW}; background:rgba(10,0,20,.85);
    color:${YELLOW}; cursor:pointer;
    box-shadow:0 0 30px ${YELLOW}66;
    animation:breathe 2s ease-in-out infinite;
    text-shadow:0 0 6px ${YELLOW};
  }
  .theater-manual-play span{
    font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:.2em;
  }

  /* Waveform */
  .theater-wave{
    display:flex; align-items:center; gap:3px;
    width:100%; max-width:480px; height:34px; padding:0 8px;
  }
  .theater-wave i{
    flex:1; min-width:2px;
    background:linear-gradient(180deg, ${CYAN} 0%, ${PINK} 100%);
    border-radius:1px;
    box-shadow:0 0 6px ${PINK}99;
    animation:wave-up .9s ease-in-out infinite alternate;
    transform-origin:center;
  }
  .theater-wave i:nth-child(3n){animation-duration:.7s}
  .theater-wave i:nth-child(5n){animation-duration:1.1s}
  .theater-wave i:nth-child(7n){animation-duration:.85s}
  @keyframes wave-up{from{transform:scaleY(.25)}to{transform:scaleY(1)}}

  .theater-status-row{
    font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:.22em;
    color:rgba(0,247,255,.85); text-shadow:0 0 6px ${CYAN}80;
  }

  /* Scoreboard */
  .theater-score-col{
    display:flex; flex-direction:column; gap:12px;
    align-self:stretch; padding:6px 0;
  }
  .theater-col-title{
    display:flex; align-items:center; justify-content:space-between;
    font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:.28em;
    color:${PINK}; text-shadow:0 0 6px ${PINK}; padding:0 4px;
  }
  .theater-col-title .head::before{content:"[ "; color:${PINK}66}
  .theater-col-title .head::after{content:" ]"; color:${PINK}66}
  .theater-col-title .live{
    display:flex; align-items:center; gap:6px;
    font-size:9px; color:${CYAN}; text-shadow:0 0 4px ${CYAN};
  }
  .theater-col-title .live .dot{
    width:5px; height:5px; border-radius:50%; background:${CYAN}; box-shadow:0 0 6px ${CYAN};
    animation:rec 1.2s ease-in-out infinite;
  }

  .theater-pchip{
    display:grid;
    grid-template-columns:34px 1fr auto;
    gap:10px; align-items:center;
    padding:10px 12px;
    background:rgba(10,0,20,.74);
    border:1px solid rgba(255,255,255,.08);
    backdrop-filter:blur(14px);
    position:relative;
    transition:border-color .2s;
  }
  .theater-pchip.you{border-color:${CYAN}73; box-shadow:0 0 22px ${CYAN}33}
  .theater-pchip.lead{border-color:${YELLOW}80; box-shadow:0 0 22px ${YELLOW}38}
  .theater-pchip.lead::before{
    content:"#1"; position:absolute; top:-7px; right:-4px;
    font-family:var(--font-display, 'Audiowide'), sans-serif;
    font-size:9px; padding:2px 6px;
    background:${YELLOW}; color:#0a0014; letter-spacing:.1em;
    box-shadow:0 0 10px ${YELLOW}99;
    clip-path:polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%);
  }
  .theater-pchip .pavatar{
    width:34px; height:34px; flex-shrink:0;
    display:grid; place-items:center;
    border:1.5px solid var(--c, ${CYAN}); border-radius:2px;
    font-family:var(--font-display, 'Audiowide'), sans-serif;
    font-size:14px; color:var(--c, ${CYAN});
    overflow:hidden;
  }
  .theater-pchip .pavatar img{width:100%; height:100%; object-fit:cover}
  .theater-pchip .pmid{display:flex; flex-direction:column; min-width:0; gap:3px}
  .theater-pchip .pname{
    font-family:var(--font-display, 'Audiowide'), sans-serif;
    font-size:14px; line-height:1; letter-spacing:.04em;
    color:#fff; text-shadow:0 0 4px rgba(255,255,255,.3);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    display:flex; align-items:center; gap:6px;
  }
  .theater-pchip .you-tag{
    font-family:'JetBrains Mono', monospace; font-size:8px; letter-spacing:.16em;
    color:${CYAN}; padding:1px 4px; background:${CYAN}1f;
  }
  .theater-pchip .pstatus{
    font-family:'JetBrains Mono', monospace; font-size:9px; letter-spacing:.16em;
    color:rgba(245,232,255,.45); text-transform:uppercase;
    display:flex; align-items:center; gap:5px;
  }
  .theater-pchip .pstatus.locked{color:${YELLOW}; text-shadow:0 0 4px ${YELLOW}}
  .theater-pchip .pstatus .pdot{
    width:5px; height:5px; border-radius:50%; background:rgba(245,232,255,.3);
  }
  .theater-pchip .pstatus.locked .pdot{background:${YELLOW}; box-shadow:0 0 6px ${YELLOW}}
  .theater-pchip .pstatus.typing .pdot{background:${CYAN}; box-shadow:0 0 6px ${CYAN}; animation:rec 1s ease-in-out infinite}
  .theater-pchip .pright{display:flex; flex-direction:column; align-items:flex-end; gap:2px}
  .theater-pchip .pscore{
    font-family:'JetBrains Mono', monospace; font-size:15px; font-weight:700; color:#fff;
    text-shadow:0 0 6px rgba(255,255,255,.4); letter-spacing:.04em; line-height:1;
  }
  .theater-pchip .pscore-label{
    font-family:'JetBrains Mono', monospace; font-size:8px; letter-spacing:.15em; color:rgba(245,232,255,.4);
  }

  /* Bottom dock */
  .theater-dock{
    display:grid;
    grid-template-columns:1.1fr 1.1fr 1.7fr auto;
    gap:14px; align-items:end;
    padding:14px 18px;
    background:rgba(10,0,20,.72);
    border:1px solid ${PINK}40;
    backdrop-filter:blur(22px);
    box-shadow:0 0 44px ${PINK}1f, inset 0 0 24px ${PURPLE}14, 0 -8px 30px rgba(10,0,20,.6);
    position:relative;
  }
  .theater-dock-tag-left{
    position:absolute; top:-9px; left:18px;
    font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:.28em;
    color:${PINK}; background:var(--bg); padding:0 8px; text-shadow:0 0 6px ${PINK};
  }
  .theater-dock-tag-right{
    position:absolute; top:-9px; right:18px;
    font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:.22em;
    color:${CYAN}; background:var(--bg); padding:0 8px; text-shadow:0 0 6px ${CYAN};
  }
  .theater-field{display:flex; flex-direction:column; gap:6px; min-width:0}
  .theater-flabel{
    display:flex; align-items:center; gap:8px;
    font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:.22em;
    color:rgba(245,232,255,.55); text-transform:uppercase;
  }
  .theater-flabel .tag{
    font-family:'JetBrains Mono', monospace; font-size:8px; padding:1px 5px;
    background:${YELLOW}2e; color:${YELLOW}; letter-spacing:.18em;
    text-shadow:0 0 4px ${YELLOW}80;
  }
  .theater-flabel .check{
    width:14px; height:14px; display:grid; place-items:center;
    border:1px solid ${CYAN}; color:${CYAN}; font-size:9px;
    box-shadow:0 0 6px ${CYAN}66;
  }
  .theater-input{
    width:100%; background:rgba(8,0,18,.7);
    border:1px solid rgba(255,255,255,.1);
    border-radius:2px; padding:11px 14px;
    color:#fff; font-family:inherit; font-size:14px;
    outline:none; transition:border-color .2s, box-shadow .2s;
  }
  .theater-input:focus{
    border-color:${CYAN};
    box-shadow:0 0 14px ${CYAN}4d, inset 0 0 12px ${CYAN}0a;
  }
  .theater-input.filled{
    border-color:${CYAN}80;
    box-shadow:0 0 12px ${CYAN}2e, inset 0 0 12px ${CYAN}0a;
  }
  .theater-input::placeholder{color:rgba(245,232,255,.25)}
  .theater-input:disabled{opacity:.55; cursor:not-allowed}

  .theater-picker{display:flex; gap:6px}
  .theater-pick{
    flex:1; min-width:0;
    display:flex; flex-direction:column; align-items:center; gap:4px;
    padding:7px 6px 6px; border-radius:2px;
    border:1px solid rgba(255,255,255,.1);
    background:rgba(8,0,18,.5);
    cursor:pointer; transition:all .2s; position:relative;
  }
  .theater-pick:hover{border-color:${PURPLE}; background:${PURPLE}14}
  .theater-pick.selected{
    border-color:${YELLOW}; background:${YELLOW}14;
    box-shadow:0 0 16px ${YELLOW}4d;
  }
  .theater-pick.selected::before{
    content:"✓"; position:absolute; top:2px; right:5px;
    font-size:9px; color:${YELLOW}; text-shadow:0 0 4px ${YELLOW};
  }
  .theater-pick:disabled{opacity:.55; cursor:not-allowed}
  .theater-pick .pick-avatar{
    width:24px; height:24px; display:grid; place-items:center;
    border:1px solid var(--c, ${CYAN}); border-radius:2px;
    font-family:var(--font-display, 'Audiowide'), sans-serif;
    font-size:12px; color:var(--c, ${CYAN});
    overflow:hidden;
  }
  .theater-pick .pick-avatar img{width:100%; height:100%; object-fit:cover}
  .theater-pick .pick-name{
    font-family:'JetBrains Mono', monospace; font-size:9px;
    color:rgba(245,232,255,.7); letter-spacing:.06em;
  }

  .theater-submit{
    padding:14px 26px;
    font-family:var(--font-display, 'Audiowide'), sans-serif;
    font-size:17px; letter-spacing:.18em;
    background:linear-gradient(180deg, ${YELLOW}1f, ${YELLOW}05);
    border:2px solid ${YELLOW}; color:${YELLOW};
    text-shadow:0 0 10px ${YELLOW}, 0 0 24px ${YELLOW}99;
    text-transform:uppercase; cursor:pointer;
    clip-path:polygon(16px 0, 100% 0, calc(100% - 16px) 100%, 0 100%);
    position:relative; overflow:hidden;
    animation:breathe 2s ease-in-out infinite;
    transition:transform .15s;
    align-self:end; height:fit-content;
    min-width:170px;
  }
  .theater-submit:hover{transform:translateY(-1px)}
  .theater-submit:disabled{
    opacity:.4; cursor:not-allowed; animation:none;
  }
  .theater-submit::after{
    content:""; position:absolute; inset:0;
    background:linear-gradient(90deg, transparent, ${YELLOW}40, transparent);
    transform:translateX(-100%);
    animation:sweep 2.6s ease-in-out infinite;
  }
  @keyframes breathe{0%,100%{box-shadow:0 0 18px ${YELLOW}47, inset 0 0 12px ${YELLOW}26}50%{box-shadow:0 0 36px ${YELLOW}99, inset 0 0 20px ${YELLOW}47}}
  @keyframes sweep{0%{transform:translateX(-100%)}55%{transform:translateX(110%)}100%{transform:translateX(110%)}}

  /* Reveal */
  .theater-reveal-card{
    display:flex; gap:24px; align-items:center;
    padding:24px;
    background:rgba(10,0,20,.78); border:1px solid ${YELLOW}40;
    box-shadow:0 0 40px ${YELLOW}26, inset 0 0 30px ${PURPLE}1f;
    backdrop-filter:blur(18px);
    max-width:560px; width:100%;
  }
  .theater-reveal-cover{
    width:140px; height:140px; flex-shrink:0;
    border:1.5px solid ${YELLOW}; box-shadow:0 0 24px ${YELLOW}66;
    overflow:hidden; background:#1a0030;
  }
  .theater-reveal-cover img{width:100%; height:100%; object-fit:cover}
  .theater-reveal-cover-fallback{
    width:100%; height:100%;
    background:
      radial-gradient(circle at 30% 35%, ${PINK} 0%, transparent 45%),
      radial-gradient(circle at 70% 65%, ${CYAN} 0%, transparent 45%),
      ${PURPLE};
  }
  .theater-reveal-meta{display:flex; flex-direction:column; gap:6px; min-width:0}
  .theater-reveal-meta .label{
    font-family:'JetBrains Mono', monospace; font-size:9px; letter-spacing:.32em;
    color:${YELLOW}; text-shadow:0 0 6px ${YELLOW};
  }
  .theater-reveal-meta .title{
    font-family:var(--font-display, 'Audiowide'), sans-serif;
    font-size:32px; line-height:1.1; color:#fff;
    text-shadow:0 0 12px rgba(255,255,255,.4), 2px 0 ${PINK}40, -2px 0 ${CYAN}40;
  }
  .theater-reveal-meta .artist{
    font-size:16px; color:rgba(245,232,255,.85);
  }
  .theater-reveal-meta .owner{
    display:flex; align-items:center; gap:8px; margin-top:8px;
    font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:.18em;
    color:rgba(245,232,255,.55);
  }
  .theater-reveal-meta .owner b{color:${CYAN}; text-shadow:0 0 6px ${CYAN}}

  .theater-verdict{
    display:flex; align-items:center; justify-content:space-between; gap:14px;
    padding:14px 18px;
    background:rgba(10,0,20,.7);
    border:1.5px solid;
    backdrop-filter:blur(16px);
    max-width:560px; width:100%;
  }
  .theater-verdict .label{
    font-family:'JetBrains Mono', monospace; font-size:9px; letter-spacing:.28em;
    color:rgba(245,232,255,.55); text-transform:uppercase;
    display:block; margin-bottom:4px;
  }
  .theater-verdict p{font-size:14px; color:#fff}
  .theater-verdict .badge{
    font-family:var(--font-display, 'Audiowide'), sans-serif;
    font-size:13px; padding:6px 14px;
    border:1.5px solid currentColor; letter-spacing:.16em;
  }

  .theater-ready{
    padding:14px 28px;
    font-family:var(--font-display, 'Audiowide'), sans-serif;
    font-size:14px; letter-spacing:.18em;
    background:rgba(10,0,20,.7);
    border:2px solid ${CYAN}; color:${CYAN};
    text-shadow:0 0 10px ${CYAN};
    cursor:pointer; text-transform:uppercase;
    transition:all .2s;
  }
  .theater-ready:hover:not(:disabled){
    background:${CYAN}14; box-shadow:0 0 24px ${CYAN}80;
  }
  .theater-ready:disabled{opacity:.55; cursor:not-allowed; border-color:${YELLOW}; color:${YELLOW}; text-shadow:0 0 10px ${YELLOW}}

  .theater-finished{
    display:flex; align-items:center; gap:12px;
    padding:14px 20px;
    background:rgba(10,0,20,.7); border:1px solid ${YELLOW}66;
    font-family:var(--font-display, 'Audiowide'), sans-serif;
    letter-spacing:.18em; color:${YELLOW}; text-shadow:0 0 8px ${YELLOW};
    box-shadow:0 0 24px ${YELLOW}33;
  }

  /* Chat drawer */
  .theater-chat-drawer{
    position:fixed; top:0; right:0; bottom:0; width:340px; z-index:60;
    display:flex; flex-direction:column;
    background:rgba(10,0,20,.95);
    border-left:1px solid ${PINK}40;
    box-shadow:-12px 0 40px rgba(10,0,20,.8);
    backdrop-filter:blur(24px);
  }
  .theater-chat-head{
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 16px; border-bottom:1px solid ${PINK}33;
    font-family:'JetBrains Mono', monospace; font-size:11px; letter-spacing:.22em;
    color:${PINK}; text-shadow:0 0 6px ${PINK};
  }
  .theater-chat-body{
    flex:1; overflow:auto; padding:12px 16px;
    display:flex; flex-direction:column; gap:8px;
  }
  .theater-chat-empty{
    font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:.16em;
    color:rgba(245,232,255,.4); text-align:center; padding:20px 0;
  }
  .theater-chat-msg{font-size:13px; line-height:1.45}
  .theater-chat-msg .who{
    font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:.12em;
    margin-right:6px;
  }
  .theater-chat-msg .txt{color:rgba(245,232,255,.9)}
  .theater-chat-form{padding:12px 16px; border-top:1px solid rgba(255,255,255,.08)}

  /* Responsive */
  @media (max-width:1180px){
    .theater-stage{padding:14px 16px 16px}
    .theater-stage > div:nth-child(2){grid-template-columns:1fr 260px !important; gap:20px !important}
  }
  @media (max-width:900px){
    .theater-stage > div:nth-child(2){grid-template-columns:1fr !important}
    .theater-score-col{display:none}
    .theater-dock{grid-template-columns:1fr 1fr !important}
    .theater-dock > .theater-field:nth-child(3){grid-column:1 / -1}
    .theater-submit{grid-column:1 / -1; width:100%}
  }
`
