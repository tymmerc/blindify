"use client"

import { Suspense, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import GameClient from "../game/GameClient"

export const dynamic = "force-dynamic"

type SoloTab = "classic" | "chrono" | "challenge"

const TABS: { key: SoloTab; label: string; accent: string }[] = [
  { key: "classic", label: "Classique", accent: "#ff2ec8" },
  { key: "chrono", label: "Chrono", accent: "#00f7ff" },
  { key: "challenge", label: "Defi", accent: "#a855f7" },
]

const roundOptions = [5, 10, 15, 20]

const durationOptions = [
  { label: "1 min", value: 60 },
  { label: "2 min", value: 120 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
]

function CornerFrame({ color }: { color: string }) {
  return (
    <>
      <span aria-hidden className="absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute right-2 top-2 h-3 w-3 border-r-2 border-t-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2" style={{ borderColor: color }} />
    </>
  )
}

function TabBar({ active, onChange }: { active: SoloTab; onChange: (t: SoloTab) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] border border-[#ff2ec8]/20 p-1">
      {TABS.map(tab => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className="flex-1 rounded-lg px-4 py-2 font-display text-xs uppercase tracking-[0.15em] transition"
            style={{
              color: isActive ? tab.accent : "#9b7fb8",
              background: isActive ? `${tab.accent}1a` : "transparent",
              border: isActive ? `1px solid ${tab.accent}66` : "1px solid transparent",
              boxShadow: isActive ? `0 0 14px ${tab.accent}40, inset 0 0 10px ${tab.accent}1a` : "none",
              textShadow: isActive ? `0 0 8px ${tab.accent}` : "none",
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function ClassicForm() {
  const router = useRouter()
  const [quickUrl, setQuickUrl] = useState("")
  const [quickError, setQuickError] = useState<string | null>(null)
  const [roundCount, setRoundCount] = useState(10)
  const [progressive, setProgressive] = useState(false)

  const handleQuickPlay = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = quickUrl.trim()
    if (!trimmed) return
    setQuickError(null)
    const encoded = encodeURIComponent(trimmed)
    const progressiveParam = progressive ? "&progressive=true" : ""
    router.push(`/solo?source=quickplay&quickUrl=${encoded}&count=${roundCount}${progressiveParam}`)
  }

  return (
    <div className="relative flex flex-col gap-5 rounded-2xl border border-[#ff2ec8]/30 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-7 shadow-glow-pink">
      <CornerFrame color="#ff2ec8" />
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">[ Classic Mode ]</p>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display text-2xl uppercase tracking-[0.04em] text-glow-pink">Blind test classique</h2>
          <span className="rounded-sm border font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 bg-[#00f7ff]/10 border-[#00f7ff]/40 text-[#00f7ff]">
            No login
          </span>
        </div>
        <p className="text-sm text-[#9b7fb8]">
          Profil ou playlist Spotify / Deezer. On pioche des titres au hasard, devine le titre et l&apos;artiste.
        </p>
      </div>

      <form onSubmit={handleQuickPlay} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="playlist-url" className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">
            Lien de playlist ou profil
          </label>
          <input
            id="playlist-url"
            type="url"
            value={quickUrl}
            onChange={e => setQuickUrl(e.target.value)}
            placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
            className="w-full rounded-lg border border-[#ff2ec8]/20 bg-[rgba(15,5,30,0.85)] px-4 py-3 text-sm text-[#f8f0ff] outline-none transition placeholder:text-[#9b7fb8]/50 focus:border-[#00f7ff] focus:shadow-[0_0_12px_rgba(0,247,255,0.3)]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">
            Nombre de titres
          </label>
          <div className="flex gap-2">
            {roundOptions.map(n => {
              const isActive = roundCount === n
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRoundCount(n)}
                  className="flex-1 rounded-sm border py-2.5 font-display text-sm uppercase tracking-[0.1em] transition"
                  style={{
                    borderColor: isActive ? "#ff2ec8" : "rgba(255,46,200,0.2)",
                    background: isActive ? "rgba(255,46,200,0.12)" : "rgba(15,5,30,0.5)",
                    color: isActive ? "#ff2ec8" : "#9b7fb8",
                    boxShadow: isActive ? "0 0 14px rgba(255,46,200,0.35), inset 0 0 8px rgba(255,46,200,0.15)" : "none",
                    textShadow: isActive ? "0 0 8px rgba(255,46,200,0.8)" : "none",
                  }}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={progressive}
              onChange={e => setProgressive(e.target.checked)}
              className="h-4 w-4 rounded border-[#ff2ec8]/30 bg-[rgba(15,5,30,0.85)] accent-[#ff2ec8]"
            />
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#9b7fb8]">
              Mode progressif (30s puis 10s)
            </span>
          </label>
        </div>

        {quickError && <p className="text-xs text-[#ff3868]">{quickError}</p>}

        <button
          type="submit"
          disabled={!quickUrl.trim()}
          className="btn-neon-pink font-display w-full justify-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Lancer le blind test
        </button>
      </form>

      <div className="flex flex-wrap gap-2 font-mono text-[10px] text-[#9b7fb8]/70">
        <span className="rounded-sm border bg-[rgba(15,5,30,0.5)] border-[#ff2ec8]/15 px-2 py-0.5">spotify.com/user/...</span>
        <span className="rounded-sm border bg-[rgba(15,5,30,0.5)] border-[#ff2ec8]/15 px-2 py-0.5">spotify.com/playlist/...</span>
        <span className="rounded-sm border bg-[rgba(15,5,30,0.5)] border-[#ff2ec8]/15 px-2 py-0.5">deezer.com/profile/...</span>
        <span className="rounded-sm border bg-[rgba(15,5,30,0.5)] border-[#ff2ec8]/15 px-2 py-0.5">deezer.com/playlist/...</span>
      </div>
    </div>
  )
}

function ChronoForm() {
  const router = useRouter()
  const [quickUrl, setQuickUrl] = useState("")
  const [quickError, setQuickError] = useState<string | null>(null)
  const [duration, setDuration] = useState(180)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = quickUrl.trim()
    if (!trimmed) return
    setQuickError(null)
    const encoded = encodeURIComponent(trimmed)
    router.push(`/chrono?source=quickplay&quickUrl=${encoded}&duration=${duration}`)
  }

  return (
    <div className="relative flex flex-col gap-5 rounded-2xl border border-[#00f7ff]/30 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-7 shadow-glow-cyan">
      <CornerFrame color="#00f7ff" />
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#ff2ec8]">[ Chrono Mode ]</p>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display text-2xl uppercase tracking-[0.04em] text-glow-cyan">Mode Chrono</h2>
          <span className="rounded-sm border font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 bg-[#ffea00]/10 border-[#ffea00]/40 text-[#ffea00]">
            Time attack
          </span>
        </div>
        <p className="text-sm text-[#9b7fb8]">
          Les titres s&apos;enchainent, devine-les avant que le temps ne s&apos;ecoule.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="chrono-url" className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">
            Lien de playlist ou profil
          </label>
          <input
            id="chrono-url"
            type="url"
            value={quickUrl}
            onChange={e => setQuickUrl(e.target.value)}
            placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
            className="w-full rounded-lg border border-[#00f7ff]/20 bg-[rgba(15,5,30,0.85)] px-4 py-3 text-sm text-[#f8f0ff] outline-none transition placeholder:text-[#9b7fb8]/50 focus:border-[#00f7ff] focus:shadow-[0_0_12px_rgba(0,247,255,0.3)]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">
            Duree du chrono
          </label>
          <div className="flex gap-2">
            {durationOptions.map(opt => {
              const isActive = duration === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDuration(opt.value)}
                  className="flex-1 rounded-sm border py-2.5 font-display text-sm uppercase tracking-[0.1em] transition"
                  style={{
                    borderColor: isActive ? "#00f7ff" : "rgba(0,247,255,0.2)",
                    background: isActive ? "rgba(0,247,255,0.12)" : "rgba(15,5,30,0.5)",
                    color: isActive ? "#00f7ff" : "#9b7fb8",
                    boxShadow: isActive ? "0 0 14px rgba(0,247,255,0.35), inset 0 0 8px rgba(0,247,255,0.15)" : "none",
                    textShadow: isActive ? "0 0 8px rgba(0,247,255,0.8)" : "none",
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {quickError && <p className="text-xs text-[#ff3868]">{quickError}</p>}

        <button
          type="submit"
          disabled={!quickUrl.trim()}
          className="btn-neon font-display w-full justify-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Lancer le chrono
        </button>
      </form>
    </div>
  )
}

function ChallengeForm() {
  const [codeInput, setCodeInput] = useState("")

  const handleCodeSubmit = () => {
    const trimmed = codeInput.trim().toUpperCase()
    if (trimmed.length >= 4) {
      window.location.href = `/blindify/challenge/?code=${trimmed}`
    }
  }

  return (
    <div className="relative flex flex-col gap-5 rounded-2xl border border-[#a855f7]/40 bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-7 shadow-glow-purple">
      <CornerFrame color="#a855f7" />
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#ff2ec8]">[ Challenge ]</p>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display text-2xl uppercase tracking-[0.04em]" style={{ color: "#a855f7", textShadow: "0 0 12px rgba(168,85,247,0.7)" }}>
            Rejoindre un defi
          </h2>
          <span className="rounded-sm border font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 bg-[#a855f7]/10 border-[#a855f7]/40 text-[#a855f7]">
            Versus
          </span>
        </div>
        <p className="text-sm text-[#9b7fb8]">
          Un ami t&apos;a envoye un code de defi ? Entre-le ici pour tenter de battre son score.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="challenge-code" className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">
            Code du defi
          </label>
          <input
            id="challenge-code"
            type="text"
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={e => e.key === "Enter" && handleCodeSubmit()}
            placeholder="EX : A3F7K2"
            maxLength={12}
            className="w-full rounded-lg border border-[#a855f7]/30 bg-[rgba(15,5,30,0.85)] px-4 py-4 text-center font-display text-2xl tracking-[0.4em] text-[#a855f7] outline-none transition placeholder:text-[#9b7fb8]/30 placeholder:tracking-[0.2em] placeholder:font-mono placeholder:text-sm focus:border-[#a855f7] focus:shadow-[0_0_18px_rgba(168,85,247,0.5)]"
            style={{ textShadow: "0 0 10px rgba(168,85,247,0.7)" }}
          />
        </div>

        <button
          type="button"
          disabled={codeInput.trim().length < 4}
          onClick={handleCodeSubmit}
          className="btn-neon-pink font-display w-full justify-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Rejoindre le defi
        </button>
      </div>
    </div>
  )
}

function InfoCard({ accent, label, title, children }: { accent: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <div
      className="relative flex-1 space-y-3 rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6 text-left"
      style={{
        borderColor: `${accent}40`,
        boxShadow: `0 0 16px ${accent}1a, inset 0 0 10px ${accent}0d`,
      }}
    >
      <CornerFrame color={accent} />
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg uppercase tracking-[0.03em] text-[#f8f0ff]">{title}</h3>
        <span
          className="rounded-sm border font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1"
          style={{
            background: `${accent}14`,
            borderColor: `${accent}66`,
            color: accent,
          }}
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

function SoloSelector() {
  const router = useRouter()
  const [tab, setTab] = useState<SoloTab>("classic")

  return (
    <div className="min-h-screen px-4 py-10 text-[#f8f0ff] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f7ff] text-glow-cyan">
              [ Mode Solo ]
            </p>
            <h1 className="font-display text-4xl md:text-5xl uppercase tracking-[0.04em] leading-tight text-glow-pink">
              Jouer en solo
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push("/modes")}
            className="rounded-sm border-[#00f7ff]/30 bg-[rgba(15,5,30,0.6)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00f7ff] hover:bg-[#00f7ff]/10 hover:border-[#00f7ff]/60 hover:shadow-glow-cyan"
          >
            Retour menu
          </Button>
        </div>

        {/* Tabs */}
        <TabBar active={tab} onChange={setTab} />

        {/* Active form */}
        {tab === "classic" && <ClassicForm />}
        {tab === "chrono" && <ChronoForm />}
        {tab === "challenge" && <ChallengeForm />}

        {/* Info cards */}
        {tab === "classic" && (
          <div className="flex flex-col gap-6 lg:flex-row">
            <InfoCard accent="#ff2ec8" label="3 etapes" title="Comment ca marche">
              <ul className="space-y-2 text-sm text-[#9b7fb8] leading-relaxed list-disc list-inside">
                <li>Choisis un profil ou une playlist publique (Spotify ou Deezer)</li>
                <li>Copie le lien depuis l&apos;app ou le navigateur</li>
                <li>Ecoute les extraits, tape le titre et/ou l&apos;artiste pour marquer des points</li>
              </ul>
            </InfoCard>

            <InfoCard accent="#00f7ff" label="Pro tip" title="Bon a savoir">
              <ul className="space-y-2 text-sm text-[#9b7fb8] leading-relaxed list-disc list-inside">
                <li>Les playlists doivent etre <strong className="text-[#f8f0ff]">publiques</strong> pour etre trouvees</li>
                <li>Profils et playlists Spotify et Deezer sont tous supportes</li>
                <li>Les extraits audio viennent de Deezer (30 secondes par titre)</li>
              </ul>
            </InfoCard>
          </div>
        )}

        {tab === "chrono" && (
          <div className="flex flex-col gap-6 lg:flex-row">
            <InfoCard accent="#00f7ff" label="Rules" title="Comment ca marche">
              <ul className="space-y-2 text-sm text-[#9b7fb8] leading-relaxed list-disc list-inside">
                <li>Le chrono demarre, les titres s&apos;enchainent automatiquement</li>
                <li>Devine le titre et/ou l&apos;artiste le plus vite possible</li>
                <li>Pas de pause entre les titres, chaque seconde compte</li>
              </ul>
            </InfoCard>

            <InfoCard accent="#ffea00" label="Score" title="Scoring">
              <ul className="space-y-2 text-sm text-[#9b7fb8] leading-relaxed list-disc list-inside">
                <li>Titre correct = 40 pts, Artiste correct = 30 pts</li>
                <li>Bonus vitesse selon ta rapidite</li>
                <li>Enchaine les bonnes reponses pour le streak bonus</li>
              </ul>
            </InfoCard>
          </div>
        )}

      </div>
    </div>
  )
}

function SoloPageInner() {
  const searchParams = useSearchParams()
  const hasConfig = Boolean(searchParams.get("source") || searchParams.get("playlistId"))

  if (!hasConfig) {
    return <SoloSelector />
  }

  return <GameClient />
}

export default function SoloPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff] text-glow-cyan">
          Loading...
        </div>
      }
    >
      <SoloPageInner />
    </Suspense>
  )
}
