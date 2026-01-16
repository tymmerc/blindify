"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Clock, Music, Send, Users } from "lucide-react"
import { motion } from "framer-motion"
import Image from "next/image"
import { Space_Grotesk, Syne } from "next/font/google"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-body" })
const syne = Syne({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" })

const theme = {
  "--bg": "#0b0710",
  "--surface": "#100d17",
  "--surface-strong": "#171225",
  "--border": "rgba(255,192,230,0.2)",
  "--ink": "#fff8fd",
  "--muted": "#d9cde1",
  "--accent": "#ff4fa5",
  "--accent-2": "#8fa7ff",
  "--success": "#8df0be",
  "--warn": "#f6c768",
  "--error": "#ff4d7a",
} as CSSProperties

type Phase = "guessing" | "locked" | "reveal"
type ChatMessage = {
  user: string
  text: string
  time: string
  system?: boolean
}

const revealFields = [
  { key: "title", label: "Titre" },
  { key: "artist", label: "Artiste" },
  { key: "album", label: "Album" },
  { key: "label", label: "Label" },
] as const

const phaseCopy: Record<Phase, { badge: string; title: string; helper: string }> = {
  guessing: {
    badge: "Live",
    title: "Ecoute en cours",
    helper: "Capture le titre et l'artiste avant la fin du timer.",
  },
  locked: {
    badge: "Locked",
    title: "On synchronise",
    helper: "On attend les derniers joueurs avant de lancer le reveal.",
  },
  reveal: {
    badge: "Reveal",
    title: "Le morceau se devoile",
    helper: "Compare tes reponses a la piste originale.",
  },
}

function VinylDisc({ size = 300 }: { size?: number }) {
  const dimension = typeof size === "number" ? `${size}px` : size
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: dimension, height: dimension, maxWidth: "80vw", maxHeight: "80vw" }}
    >
      <motion.div
        className="absolute inset-0 rounded-full border border-[var(--border)] shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
        style={{
          backgroundImage:
            "radial-gradient(circle at center,#1b1324 0%,#0f0c14 55%,#05030a 100%), repeating-radial-gradient(circle at center,rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 8px)",
          backgroundBlendMode: "screen",
        }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 16, ease: "linear" }}
      >
        <div className="absolute inset-[14%] rounded-full border border-[var(--border)] bg-[radial-gradient(circle_at_center,#0a070f_0%,#0f0a15_65%,#0a070f_100%)]">
          <div className="absolute inset-1 rounded-full border border-[var(--border)] bg-[conic-gradient(from_45deg,rgba(255,255,255,0.1),rgba(255,255,255,0)_18%)] opacity-60" />
        </div>
        <div
          className="absolute inset-[32%] rounded-full border border-[var(--border)]"
          style={{ background: "var(--accent)" }}
        >
          <div className="absolute inset-1 rounded-full bg-[var(--surface)]" />
        </div>
        <div className="absolute inset-[46%] rounded-full bg-[var(--bg)]" />
      </motion.div>
      <motion.div
        className="absolute h-[120%] w-[120%] rounded-full border"
        style={{ borderColor: "rgba(255,79,165,0.22)" }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.12, 0.3] }}
        transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute h-[140%] w-[140%] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(143,167,255,0.16) 0%, transparent 55%)" }}
        animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.2, 0.38, 0.2] }}
        transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
      />
    </div>
  )
}

export default function BlindifyGamePage() {
  const roundDuration = 15
  const [phase, setPhase] = useState<Phase>("guessing")
  const [timer, setTimer] = useState(roundDuration)
  const [answers, setAnswers] = useState({
    title: "",
    artist: "",
    album: "",
    label: "",
  })
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { user: "Sofia", text: "Prets ?", time: "00:12" },
    { user: "Lena", text: "Go", time: "00:10" },
    { user: "Mathieu", text: "Dur celle-la", time: "00:05" },
  ])
  const [newMessage, setNewMessage] = useState("")
  const [selectedPlayer, setSelectedPlayer] = useState<string>("Vous")
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase !== "guessing") return
    if (timer <= 0) {
      setPhase("locked")
      return
    }
    const intervalId = setInterval(() => setTimer(value => value - 1), 1000)
    return () => clearInterval(intervalId)
  }, [timer, phase])

  useEffect(() => {
    const container = chatScrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [chatMessages])

  const timerColor =
    phase === "guessing"
      ? timer > 10
        ? "var(--ink)"
        : timer > 5
          ? "var(--warn)"
          : "var(--error)"
      : "var(--accent)"

  const timerProgress =
    phase === "guessing" ? Math.max(0, Math.min(100, (timer / roundDuration) * 100)) : 100

  const timerLabel = phase === "guessing" ? `${timer}s` : phase === "locked" ? "LOCK" : "REVEAL"

  const submit = () => {
    setPhase("locked")
    setChatMessages(prev => [
      ...prev,
      { user: "SYSTEM", text: "Reponse envoyee", time: "00:00", system: true },
    ])
  }

  const sendMessage = () => {
    if (!newMessage.trim()) return
    setChatMessages(prev => [...prev, { user: "Vous", text: newMessage, time: "00:00" }])
    setNewMessage("")
  }

  const reveal = () => setPhase("reveal")
  const reset = () => {
    setPhase("guessing")
    setTimer(roundDuration)
    setAnswers({ title: "", artist: "", album: "", label: "" })
  }

const correctAnswers = {
  title: "Blinding Lights",
  artist: "The Weeknd",
  album: "After Hours",
  label: "Republic Records",
  albumCover: "/placeholder.jpg",
}

  type PlayerAnswers = { title?: string; artist?: string; album?: string; label?: string }

  const verdict = (field: keyof typeof answers, source?: PlayerAnswers | typeof answers) => {
    if (phase !== "reveal") return null
    const pool = (source ?? answers) as Record<string, string | undefined>
    const user = (pool[field] ?? "").toLowerCase().trim()
    const good = correctAnswers[field].toLowerCase()
    if (user === good) return "ok"
    if (user && good.includes(user)) return "warn"
    return "ko"
  }

  const verdictStyle = (value: "ok" | "warn" | "ko" | null): CSSProperties => {
    if (value === "ok") return { borderColor: "var(--success)", background: "rgba(120,241,196,0.08)" }
    if (value === "warn") return { borderColor: "var(--warn)", background: "rgba(255,122,191,0.08)" }
    if (value === "ko") return { borderColor: "var(--error)", background: "rgba(255,45,143,0.06)" }
    return { borderColor: "var(--border)" }
  }

const leaderboard = [
  { name: "Lena", score: 2450 },
  { name: "Vous", score: 2380 },
  { name: "Mathieu", score: 2100 },
  { name: "Sofia", score: 1950 },
]

const playerAnswerSamples: Record<string, PlayerAnswers | undefined> = {
  Lena: { title: "Blinding Lights", artist: "The Weeknd", album: "After Hours", label: "Republic" },
  Mathieu: { title: "Save Your Tears", artist: "The Weeknd", album: "After Hours" },
  Sofia: { title: "In Your Eyes", artist: "The Weeknd" },
}

  const waitingPlayers = [
    { name: "Lena", ready: true },
    { name: "Mathieu", ready: true },
    { name: "Sofia", ready: true },
    { name: "Pierre", ready: false },
  ]

  const readyCount = waitingPlayers.filter(player => player.ready).length
  const goBack = () => {
    if (typeof window !== "undefined") window.history.back()
  }
  const getPlayerAnswers = (name: string): PlayerAnswers => (name === "Vous" ? answers : playerAnswerSamples[name] ?? {})
  const selectedAnswers = getPlayerAnswers(selectedPlayer)

  const rootStyle: CSSProperties = {
    ...theme,
    background: "var(--bg)",
    color: "var(--ink)",
    fontFamily: "var(--font-body)",
  }

  const displayStyle: CSSProperties = { fontFamily: "var(--font-display)" }

  const panelClassName =
    "rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_26px_70px_rgba(0,0,0,0.38)]"

  return (
    <div
      className={`relative min-h-screen overflow-hidden ${spaceGrotesk.variable} ${syne.variable}`}
      style={rootStyle}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-0 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,79,165,0.24)_0,transparent_60%)] blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(143,167,255,0.2)_0,transparent_65%)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(143,167,255,0.12)_0,transparent_40%,rgba(16,13,23,0.6)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_55%)]" />
      </div>

      <div className="relative">
        <header className="border-b border-[var(--border)]/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-strong)]">
                <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,var(--accent)_0,transparent_65%)] opacity-40" />
                <Clock className="relative h-5 w-5" style={{ color: timerColor }} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--muted)]">Blindify</p>
                <h1 className="text-2xl font-semibold" style={displayStyle}>
                  Mode amis
                </h1>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-between gap-4 md:justify-center">
              <div className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold" style={{ color: timerColor }}>
                    {timerLabel}
                  </span>
                  <div className="h-1.5 w-32 rounded-full bg-[var(--bg)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${timerProgress}%`, background: timerColor }}
                    />
                  </div>
                  <span className="text-xs text-[var(--muted)]">Manche 3 / 5</span>
                </div>
              </div>
              <div className="hidden items-center gap-2 text-xs text-[var(--muted)] md:flex">
                <Users className="h-4 w-4" />
                <span>{waitingPlayers.length} joueurs</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-2 text-[10px] uppercase tracking-[0.35em] text-[var(--muted)] transition hover:text-[var(--ink)]"
                onClick={goBack}
              >
                Retour lobby
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pb-10 pt-6 lg:flex-row">
          <main className="flex-1 space-y-6">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className={`${panelClassName} relative overflow-hidden`}>
                <div className="absolute -left-10 top-10 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,79,165,0.16)_0,transparent_60%)] blur-2xl" />
                <div className="absolute -right-16 bottom-0 h-48 w-48 rounded-full bg-[radial-gradient(circle_at_center,rgba(143,167,255,0.18)_0,transparent_65%)] blur-2xl" />
                {phase === "reveal" ? (
                  <div className="relative grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Piste originale</div>
                      <div className="mt-3 flex items-start gap-3">
                        {correctAnswers.albumCover && (
                          <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                            <Image
                              src={correctAnswers.albumCover}
                              alt={`Pochette ${correctAnswers.album}`}
                              fill
                              sizes="64px"
                              className="object-cover"
                              priority
                            />
                          </div>
                        )}
                        <div>
                          <div className="text-xl font-semibold" style={displayStyle}>
                            {correctAnswers.title}
                          </div>
                          <p className="text-sm text-[var(--muted)]">{correctAnswers.artist}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                          Album • <span className="text-[var(--ink)]">{correctAnswers.album}</span>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                          Label • <span className="text-[var(--ink)]">{correctAnswers.label}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        Reponses de {selectedPlayer}
                      </div>
                      <div className="mt-3 space-y-2">
                        {revealFields.map(field => {
                          const value = verdict(field.key, selectedAnswers)
                          return (
                            <div
                              key={field.key}
                              className="rounded-xl border px-3 py-2 text-sm"
                              style={verdictStyle(value)}
                            >
                              {field.label} : {selectedAnswers[field.key] || "(vide)"}
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
                        <span className="text-[var(--muted)]">Round bonus</span>{" "}
                        <span className="font-semibold" style={{ color: "var(--accent)" }}>
                          +450 pts
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative grid gap-8 xl:grid-cols-[1.1fr_1fr] xl:items-center">
                    <div className="relative flex items-center justify-center">
                      <VinylDisc size={300} />
                      <div className="absolute bottom-6 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-strong)]/70 px-4 py-2 text-xs text-[var(--muted)] backdrop-blur">
                        <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                        <span>
                          {phase === "guessing"
                            ? "Extrait en cours"
                            : phase === "locked"
                              ? "On finalise les reponses"
                              : "Reveal en cours"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.35em] text-[var(--muted)]">
                            {phaseCopy[phase].badge}
                          </p>
                          <h2 className="mt-1 text-3xl font-semibold" style={displayStyle}>
                            {phaseCopy[phase].title}
                          </h2>
                          <p className="mt-1 text-sm text-[var(--muted)]">{phaseCopy[phase].helper}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3">
                        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                          <span>Salle amis</span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {readyCount}/{waitingPlayers.length} prets
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {waitingPlayers.map(player => (
                            <span
                              key={player.name}
                              className="rounded-full border px-3 py-1"
                              style={{
                                borderColor: player.ready ? "var(--accent)" : "var(--border)",
                                color: player.ready ? "var(--accent)" : "var(--muted)",
                                background: player.ready ? "rgba(255,79,165,0.08)" : "transparent",
                              }}
                            >
                              {player.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.section>

            {phase === "guessing" && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className={panelClassName}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Ta reponse</p>
                    <h3 className="text-2xl font-semibold" style={displayStyle}>
                      Capture la track
                    </h3>
                    <p className="text-sm text-[var(--muted)]">Titre + artiste suffisent pour scorer.</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-2 text-xs text-[var(--muted)]">
                    <Music className="h-4 w-4" style={{ color: "var(--accent)" }} />
                    <span>Extrait 15s</span>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {(["title", "artist", "album", "label"] as const).map(field => (
                    <label key={field} className="space-y-2 text-xs text-[var(--muted)]">
                      <span className="uppercase tracking-[0.35em]">{field}</span>
                      <input
                        value={answers[field]}
                        onChange={event => setAnswers({ ...answers, [field]: event.target.value })}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    onClick={submit}
                    className="w-full rounded-xl py-3 text-sm font-semibold transition sm:w-auto sm:px-6"
                    style={{
                      background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                      color: "#0b0d11",
                    }}
                  >
                    Valider
                  </button>
                  <p className="text-xs text-[var(--muted)]">
                    4 joueurs amis • combo {leaderboard[0].score > leaderboard[1].score ? "+2" : "+1"}
                  </p>
                </div>
              </motion.section>
            )}

            {phase === "locked" && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className={panelClassName}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Reponses verrouillees</p>
                    <h3 className="text-2xl font-semibold" style={displayStyle}>
                      On attend le dernier joueur
                    </h3>
                    <p className="text-sm text-[var(--muted)]">
                      La revelation demarre des que tout le monde a valide.
                    </p>
                  </div>
                  <button
                    onClick={reveal}
                    className="rounded-xl border border-[var(--border)] px-5 py-2 text-sm transition"
                    style={{ color: "var(--muted)" }}
                  >
                    Lancer le reveal
                  </button>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {waitingPlayers.map(player => (
                    <div
                      key={player.name}
                      className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
                      style={{
                        borderColor: player.ready ? "var(--accent)" : "var(--border)",
                        color: player.ready ? "var(--accent)" : "var(--muted)",
                        background: player.ready ? "rgba(255,79,165,0.08)" : "transparent",
                      }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: player.ready ? "var(--accent)" : "var(--border)" }} />
                      {player.name}
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {phase === "reveal" && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className={panelClassName}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Reveal complet</p>
                    <h3 className="text-2xl font-semibold" style={displayStyle}>
                      Classement amis
                    </h3>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-4">
                  <div className="mb-2 text-sm font-semibold">Classement</div>
                  <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
                    {leaderboard.map((player, index) => (
                      <div
                        key={player.name}
                        className="relative cursor-pointer outline-none"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedPlayer(player.name)}
                        onKeyDown={event => (event.key === "Enter" || event.key === " ") && setSelectedPlayer(player.name)}
                      >
                        {(() => {
                          const isSelected = selectedPlayer === player.name
                          const highlight = isSelected || index === 0
                          return (
                        <span
                          className="rounded-full border px-3 py-1"
                          style={{
                            borderColor: highlight ? "var(--accent)" : "var(--border)",
                            color: highlight ? "var(--accent)" : "var(--muted)",
                            background: highlight ? "rgba(143,167,255,0.12)" : "transparent",
                          }}
                        >
                          {index + 1}. {player.name} — {player.score} pts
                        </span>
                          )
                        })()}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={reset}
                  className="mt-6 w-full rounded-xl border border-[var(--border)] py-3 text-sm uppercase tracking-[0.3em] text-[var(--muted)] transition hover:text-[var(--ink)]"
                >
                  Nouvelle manche
                </button>
              </motion.section>
            )}
          </main>

          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex w-full flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(0,0,0,0.35)] lg:w-80"
          >
            <div className="border-b border-[var(--border)] px-5 py-4">
              <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Chat live</p>
              <div className="mt-2 flex items-center justify-between">
                <h3 className="text-lg font-semibold" style={displayStyle}>
                  Flux de salle
                </h3>
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <Users className="h-4 w-4" />
                  <span>4 actifs</span>
                </div>
              </div>
            </div>

            <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-auto px-5 py-4 text-sm">
              {chatMessages.map((message, index) => (
                <div key={index} className="space-y-1">
                  {message.system ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                      {message.text}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold" style={{ color: "var(--accent)" }}>
                          {message.user}
                        </span>
                        <span className="text-[var(--muted)]">{message.time}</span>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                        {message.text}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border)] p-4">
              <div className="flex gap-2">
                <input
                  value={newMessage}
                  onChange={event => setNewMessage(event.target.value)}
                  onKeyDown={event => event.key === "Enter" && sendMessage()}
                  className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                  placeholder="Envoyer un message"
                />
                <button
                  onClick={sendMessage}
                  className="rounded-xl px-3 py-2"
                  style={{ background: "var(--accent)", color: "#0b0d11" }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  )
}
