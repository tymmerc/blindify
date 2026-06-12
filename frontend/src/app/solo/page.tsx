"use client"

import { Suspense, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import GameClient from "../game/GameClient"

export const dynamic = "force-dynamic"

type SoloTab = "classic" | "chrono" | "challenge"

const TABS: { key: SoloTab; label: string; accent: string }[] = [
  { key: "classic", label: "Classique", accent: "#c65133" },
  { key: "chrono", label: "Chrono", accent: "#e0a32e" },
  { key: "challenge", label: "Defi", accent: "#7d9471" },
]

const roundOptions = [5, 10, 15, 20]

const durationOptions = [
  { label: "1 min", value: 60 },
  { label: "2 min", value: 120 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
]

function TabBar({ active, onChange }: { active: SoloTab; onChange: (t: SoloTab) => void }) {
  return (
    <div className="flex gap-1 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-1 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
      {TABS.map(tab => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex-1 rounded px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition ${
              isActive ? "bg-[#c65133] text-[#f4ecdb]" : "text-[#8a7558] hover:text-[#2e2014]"
            }`}
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
    <div className="flex flex-col gap-5 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-7 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#c65133]">Face A · Classique</p>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display text-2xl font-semibold text-[#2e2014]">Blind test classique</h2>
          <span className="rounded-full border-[1.5px] border-[#2e2014] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
            No login
          </span>
        </div>
        <p className="text-sm text-[#6b573f]">
          Profil ou playlist Spotify / Deezer. On pioche des titres au hasard, devine le titre et l&apos;artiste.
        </p>
      </div>

      <form onSubmit={handleQuickPlay} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="playlist-url" className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
            Lien de playlist ou profil
          </label>
          <input
            id="playlist-url"
            type="url"
            value={quickUrl}
            onChange={e => setQuickUrl(e.target.value)}
            placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
            className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-3 text-sm text-[#2e2014] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
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
                  className={`flex-1 rounded-md border-[1.5px] py-2.5 font-display text-sm font-semibold transition ${
                    isActive
                      ? "border-[#2e2014] bg-[#c65133] text-[#f4ecdb] shadow-[2px_2px_0_#2e2014]"
                      : "border-[rgba(46,32,20,.35)] bg-[#efe5d0] text-[#6b573f] hover:border-[#2e2014]"
                  }`}
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
              className="h-4 w-4 rounded border-[#2e2014] bg-[#efe5d0] accent-[#c65133]"
            />
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-[#6b573f]">
              Mode progressif (30s, 20s, 10s)
            </span>
          </label>
        </div>

        {quickError && <p className="text-xs font-bold text-[#9c2f1d]">{quickError}</p>}

        <button
          type="submit"
          disabled={!quickUrl.trim()}
          className="btn-neon w-full justify-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Lancer le blind test
        </button>
      </form>

      <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#8a7558]">
        <span className="rounded-full border-[1.5px] border-[rgba(46,32,20,.22)] px-2.5 py-0.5 normal-case tracking-normal">spotify.com/user/...</span>
        <span className="rounded-full border-[1.5px] border-[rgba(46,32,20,.22)] px-2.5 py-0.5 normal-case tracking-normal">spotify.com/playlist/...</span>
        <span className="rounded-full border-[1.5px] border-[rgba(46,32,20,.22)] px-2.5 py-0.5 normal-case tracking-normal">deezer.com/profile/...</span>
        <span className="rounded-full border-[1.5px] border-[rgba(46,32,20,.22)] px-2.5 py-0.5 normal-case tracking-normal">deezer.com/playlist/...</span>
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
    <div className="flex flex-col gap-5 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-7 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#e0a32e]">Face A · Chrono</p>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display text-2xl font-semibold text-[#2e2014]">Mode Chrono</h2>
          <span className="rounded-full border-[1.5px] border-[#e0a32e] bg-[#e0a32e] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
            Time attack
          </span>
        </div>
        <p className="text-sm text-[#6b573f]">
          Les titres s&apos;enchainent, devine-les avant que le temps ne s&apos;ecoule.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="chrono-url" className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
            Lien de playlist ou profil
          </label>
          <input
            id="chrono-url"
            type="url"
            value={quickUrl}
            onChange={e => setQuickUrl(e.target.value)}
            placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
            className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-3 text-sm text-[#2e2014] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
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
                  className={`flex-1 rounded-md border-[1.5px] py-2.5 font-display text-sm font-semibold transition ${
                    isActive
                      ? "border-[#2e2014] bg-[#c65133] text-[#f4ecdb] shadow-[2px_2px_0_#2e2014]"
                      : "border-[rgba(46,32,20,.35)] bg-[#efe5d0] text-[#6b573f] hover:border-[#2e2014]"
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {quickError && <p className="text-xs font-bold text-[#9c2f1d]">{quickError}</p>}

        <button
          type="submit"
          disabled={!quickUrl.trim()}
          className="btn-neon w-full justify-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
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
    <div className="flex flex-col gap-5 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-7 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#7d9471]">Face A · Defi</p>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display text-2xl font-semibold text-[#2e2014]">Rejoindre un defi</h2>
          <span className="rounded-full border-[1.5px] border-[#7d9471] bg-[#7d9471] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f4ecdb]">
            Versus
          </span>
        </div>
        <p className="text-sm text-[#6b573f]">
          Un ami t&apos;a envoye un code de defi ? Entre-le ici pour tenter de battre son score.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="challenge-code" className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
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
            className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-4 text-center font-display text-2xl font-semibold tracking-[0.4em] text-[#2e2014] outline-none transition placeholder:text-sm placeholder:font-sans placeholder:italic placeholder:tracking-[0.2em] placeholder:text-[#b3a182] focus:border-[#c65133]"
          />
        </div>

        <button
          type="button"
          disabled={codeInput.trim().length < 4}
          onClick={handleCodeSubmit}
          className="btn-neon w-full justify-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Rejoindre le defi
        </button>
      </div>
    </div>
  )
}

function InfoCard({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 space-y-3 rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] p-6 text-left shadow-[4px_4px_0_rgba(46,32,20,.12)]">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-[#2e2014]">{title}</h3>
        <span className="rounded-full border-[1.5px] border-[#2e2014] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
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
    <div className="min-h-screen px-4 py-10 text-[#2e2014] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">
              Select · Solo
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] md:text-5xl">
              Jouer en <em className="font-medium italic text-[#c65133]">solo</em>
            </h1>
          </div>
          <button
            type="button"
            onClick={() => router.push("/modes")}
            className="rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Retour menu
          </button>
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
            <InfoCard label="3 etapes" title="Comment ca marche">
              <ul className="space-y-2 text-sm text-[#6b573f] leading-relaxed list-disc list-inside">
                <li>Choisis un profil ou une playlist publique (Spotify ou Deezer)</li>
                <li>Copie le lien depuis l&apos;app ou le navigateur</li>
                <li>Ecoute les extraits, tape le titre et/ou l&apos;artiste pour marquer des points</li>
              </ul>
            </InfoCard>

            <InfoCard label="Pro tip" title="Bon a savoir">
              <ul className="space-y-2 text-sm text-[#6b573f] leading-relaxed list-disc list-inside">
                <li>Les playlists doivent etre <strong className="text-[#2e2014]">publiques</strong> pour etre trouvees</li>
                <li>Profils et playlists Spotify et Deezer sont tous supportes</li>
                <li>Les extraits audio viennent de Deezer (30 secondes par titre)</li>
              </ul>
            </InfoCard>
          </div>
        )}

        {tab === "chrono" && (
          <div className="flex flex-col gap-6 lg:flex-row">
            <InfoCard label="Rules" title="Comment ca marche">
              <ul className="space-y-2 text-sm text-[#6b573f] leading-relaxed list-disc list-inside">
                <li>Le chrono demarre, les titres s&apos;enchainent automatiquement</li>
                <li>Devine le titre et/ou l&apos;artiste le plus vite possible</li>
                <li>Pas de pause entre les titres, chaque seconde compte</li>
              </ul>
            </InfoCard>

            <InfoCard label="Score" title="Scoring">
              <ul className="space-y-2 text-sm text-[#6b573f] leading-relaxed list-disc list-inside">
                <li>Titre correct = 1 pt, Artiste correct = 1 pt</li>
                <li>Pas de bonus : le score = tes bonnes reponses</li>
                <li>Enchaine les bonnes reponses pour la serie (pour le style)</li>
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
        <div className="grid min-h-screen place-items-center text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
          Chargement...
        </div>
      }
    >
      <SoloPageInner />
    </Suspense>
  )
}
