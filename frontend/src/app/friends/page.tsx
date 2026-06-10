"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Users, LogIn, Music } from "lucide-react"
import { useMode } from "@/contexts/ModeContext"
import { api } from "@/lib/api"

type Intent = "create" | "join" | null
type Step = "nickname" | "music" | "intent" | "code"

const ACCENT = "#ec4899"

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div
      className="h-1.5 rounded-full transition-all duration-300"
      style={{
        width: active ? 24 : 8,
        backgroundColor: active ? ACCENT : done ? "rgba(236,72,153,0.5)" : "rgba(255,255,255,0.1)",
      }}
    />
  )
}

function StepShell({
  step,
  totalSteps,
  currentIndex,
  onBack,
  children,
}: {
  step: Step
  totalSteps: number
  currentIndex: number
  onBack: (() => void) | null
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-md">
        {/* Top bar */}
        <div className="mb-8 flex items-center justify-between">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 rounded-sm border border-[#00f7ff]/30 bg-[rgba(15,5,30,0.7)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#00f7ff]/80 backdrop-blur transition hover:border-[#00f7ff] hover:text-[#00f7ff] hover:shadow-[0_0_12px_rgba(0,247,255,0.3)]"
            >
              <ArrowLeft size={13} />
              Retour
            </button>
          ) : (
            <span />
          )}
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#ff2ec8] text-glow-pink">[ Friends_Mode ]</p>
        </div>

        {/* Progress dots */}
        <div className="mb-10 flex items-center justify-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <StepDot key={i} active={i === currentIndex} done={i < currentIndex} />
          ))}
        </div>

        {/* Step content */}
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">{children}</div>
      </div>
    </div>
  )
}

function FriendsEntryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setMode, mode } = useMode()

  // Detect ?join=CODE from shared link
  const joinParam = searchParams.get("join")?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? ""

  useEffect(() => {
    if (mode !== "friends") setMode("friends")
  }, [mode, setMode])

  const [intent, setIntent] = useState<Intent>(joinParam ? "join" : null)
  const [step, setStep] = useState<Step>("nickname")
  const [nickname, setNickname] = useState(() => {
    if (typeof window === "undefined") return ""
    return localStorage.getItem("blindify_nickname") ?? ""
  })
  const [profileUrl, setProfileUrl] = useState(() => {
    if (typeof window === "undefined") return ""
    return localStorage.getItem("blindify_profile_url") ?? ""
  })
  const [joinCode, setJoinCode] = useState(joinParam)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [navigating, setNavigating] = useState(false)
  const nicknameRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const musicRef = useRef<HTMLInputElement>(null)

  // Auto-focus inputs on step change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (step === "nickname") nicknameRef.current?.focus()
      if (step === "code") codeRef.current?.focus()
      if (step === "music") musicRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [step])

  // Flow: nickname -> music -> intent -> (code if join)
  // If ?join=CODE is present, skip intent and code steps entirely
  const steps: Step[] = joinParam
    ? ["nickname", "music"]
    : intent === "join"
      ? ["nickname", "music", "intent", "code"]
      : ["nickname", "music", "intent"]
  const currentIndex = steps.indexOf(step)
  const totalSteps = steps.length

  const goBack = useCallback(() => {
    const idx = steps.indexOf(step)
    if (idx <= 0) {
      router.push("/modes")
      return
    }
    // When going back from code, reset intent so user can re-choose
    if (step === "code") {
      setIntent(null)
      setStep("intent")
      return
    }
    setStep(steps[idx - 1])
  }, [step, steps, router])

  const goNext = useCallback(() => {
    const idx = steps.indexOf(step)
    if (idx < steps.length - 1) {
      setStep(steps[idx + 1])
    }
  }, [step, steps])

  const handleGo = useCallback(async () => {
    if (navigating) return
    setNavigating(true)
    setMode("friends")

    // Persist nickname and profile URL for next visit
    if (nickname.trim()) localStorage.setItem("blindify_nickname", nickname.trim())
    if (profileUrl.trim()) localStorage.setItem("blindify_profile_url", profileUrl.trim())

    // Ensure guest session exists before navigating to multiplayer
    try {
      await api.ensureUserSession(nickname.trim() || "Joueur")
    } catch {
      // Session creation failed - continue anyway, ModeLobbyView will retry
    }

    const nicknameParam = nickname.trim() ? `&nickname=${encodeURIComponent(nickname.trim())}` : ""
    const profileParam = profileUrl.trim() ? `&profileUrl=${encodeURIComponent(profileUrl.trim())}` : ""

    if (intent === "join") {
      const code = joinCode.trim().toUpperCase()
      if (!code) {
        setJoinError("Entre un code valide.")
        setNavigating(false)
        return
      }
      await router.push(`/multiplayer?mode=friends&code=${encodeURIComponent(code)}${nicknameParam}${profileParam}`)
    } else {
      await router.push(`/multiplayer?mode=friends&intent=host${nicknameParam}${profileParam}`)
    }
  }, [navigating, intent, nickname, profileUrl, joinCode, router, setMode])

  // Step 1: Pseudo
  if (step === "nickname") {
    const canContinue = nickname.trim().length >= 2
    return (
      <StepShell step="nickname" totalSteps={totalSteps} currentIndex={currentIndex} onBack={() => router.push("/modes")}>
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl uppercase tracking-[0.04em] text-[#ff2ec8] text-glow-pink sm:text-4xl">Comment tu t'appelles ?</h1>
          <p className="text-sm text-[#8896b0]">C'est le nom que tes rivaux verront.</p>
        </div>

        <div className="mt-10 space-y-6">
          <input
            ref={nicknameRef}
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && canContinue) goNext()
            }}
            placeholder="Ton pseudo"
            maxLength={20}
            className="w-full rounded-xl border border-[#ff2ec8]/20 bg-[rgba(15,5,30,0.85)] backdrop-blur-[16px] px-5 py-4 text-center text-lg font-semibold text-[#E0E8F0] outline-none placeholder:text-[#8896b0]/40 focus:border-[#00f7ff] focus:shadow-[0_0_20px_rgba(0,247,255,0.35)]"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={!canContinue}
            onClick={goNext}
            className="flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-3.5 text-sm font-semibold text-white transition disabled:opacity-30 bg-[rgba(255,46,200,0.1)] border-[#ff2ec8] text-[#ff2ec8] uppercase tracking-[0.1em] font-display hover:bg-[rgba(255,46,200,0.2)] hover:shadow-[0_0_28px_rgba(255,46,200,0.6),inset_0_0_18px_rgba(255,46,200,0.25)] [text-shadow:0_0_8px_rgba(255,46,200,0.7)]"
          >
            Continuer
            <ArrowRight size={15} />
          </button>
        </div>
      </StepShell>
    )
  }

  // Step 2: Lien Spotify/Deezer (optionnel)
  if (step === "music") {
    const isLastStep = joinParam ? true : false
    const handleMusicNext = isLastStep ? handleGo : goNext
    const buttonLabel = isLastStep ? "Rejoindre la partie" : "Continuer"

    return (
      <StepShell step="music" totalSteps={totalSteps} currentIndex={currentIndex} onBack={goBack}>
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl uppercase tracking-[0.04em] text-[#ff2ec8] text-glow-pink sm:text-4xl">Ta musique</h1>
          <p className="text-sm text-[#8896b0]">
            Colle ton lien de profil Spotify ou Deezer pour jouer avec tes propres playlists.
          </p>
        </div>

        <div className="mt-10 space-y-4">
          <div className="relative">
            <Music size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8896b0]/50" />
            <input
              ref={musicRef}
              value={profileUrl}
              onChange={e => setProfileUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleMusicNext()
              }}
              placeholder="https://open.spotify.com/user/..."
              className="w-full rounded-xl border border-[#ff2ec8]/20 bg-[rgba(15,5,30,0.85)] backdrop-blur-[16px] py-4 pl-10 pr-5 text-sm text-[#E0E8F0] outline-none placeholder:text-[#8896b0]/40 focus:border-[#00f7ff] focus:shadow-[0_0_20px_rgba(0,247,255,0.35)]"
              autoComplete="off"
            />
          </div>

          <button
            type="button"
            disabled={isLastStep && navigating}
            onClick={handleMusicNext}
            className="flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-3.5 text-sm font-semibold text-white transition disabled:opacity-60 bg-[rgba(255,46,200,0.1)] border-[#ff2ec8] text-[#ff2ec8] uppercase tracking-[0.1em] font-display hover:bg-[rgba(255,46,200,0.2)] hover:shadow-[0_0_28px_rgba(255,46,200,0.6),inset_0_0_18px_rgba(255,46,200,0.25)] [text-shadow:0_0_8px_rgba(255,46,200,0.7)]"
          >
            {navigating && isLastStep ? "Chargement..." : buttonLabel}
            {!(navigating && isLastStep) && <ArrowRight size={15} />}
          </button>

          {!profileUrl.trim() && (
            <button
              type="button"
              disabled={isLastStep && navigating}
              onClick={handleMusicNext}
              className="w-full py-2 text-xs font-medium text-[#8896b0]/60 transition hover:text-[#8896b0]"
            >
              {isLastStep ? "Rejoindre sans importer" : "Passer cette etape"}
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-[10px] text-[#8896b0]/50">
          Tu pourras aussi importer ta musique dans le lobby.
        </p>
      </StepShell>
    )
  }

  // Step 3: Creer ou Rejoindre
  if (step === "intent") {
    return (
      <StepShell step="intent" totalSteps={totalSteps} currentIndex={currentIndex} onBack={goBack}>
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl uppercase tracking-[0.04em] text-[#ff2ec8] text-glow-pink sm:text-4xl">Qu'est-ce que tu veux faire ?</h1>
          <p className="text-sm text-[#8896b0]">Lance un blind test avec tes amis.</p>
        </div>

        <div className="mt-10 grid gap-3">
          <button
            type="button"
            disabled={navigating}
            onClick={async () => {
              if (navigating) return
              setNavigating(true)
              setMode("friends")
              try { await api.ensureUserSession(nickname.trim() || "Joueur") } catch {}
              const nicknameParam = nickname.trim() ? `&nickname=${encodeURIComponent(nickname.trim())}` : ""
              const profileParam = profileUrl.trim() ? `&profileUrl=${encodeURIComponent(profileUrl.trim())}` : ""
              await router.push(`/multiplayer?mode=friends&intent=host${nicknameParam}${profileParam}`)
            }}
            className="group flex items-center gap-4 rounded-2xl border border-[#ff2ec8]/20 bg-[rgba(15,5,30,0.7)] backdrop-blur-[16px] px-6 py-5 text-left transition hover:border-[#ff2ec8] hover:shadow-[0_0_20px_rgba(255,46,200,0.35)] hover:bg-[rgba(15,5,30,0.85)]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,46,200,0.12)] shadow-[0_0_12px_rgba(255,46,200,0.4)] transition group-hover:scale-105">
              <Users size={20} className="text-[#ff2ec8]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#E0E8F0]">Creer une partie</p>
              <p className="mt-0.5 text-xs text-[#8896b0]">Deviens hote, partage le code a tes amis.</p>
            </div>
            <ArrowRight size={16} className="text-[#8896b0]/40 transition group-hover:text-[#8896b0]" />
          </button>

          <button
            type="button"
            onClick={() => {
              setIntent("join")
              setStep("code")
            }}
            className="group flex items-center gap-4 rounded-2xl border border-[#ff2ec8]/20 bg-[rgba(15,5,30,0.7)] backdrop-blur-[16px] px-6 py-5 text-left transition hover:border-[#ff2ec8] hover:shadow-[0_0_20px_rgba(255,46,200,0.35)] hover:bg-[rgba(15,5,30,0.85)]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,46,200,0.12)] shadow-[0_0_12px_rgba(255,46,200,0.4)] transition group-hover:scale-105">
              <LogIn size={20} className="text-[#ff2ec8]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#E0E8F0]">Rejoindre une partie</p>
              <p className="mt-0.5 text-xs text-[#8896b0]">Un ami t'a envoye un code ? Entre-le ici.</p>
            </div>
            <ArrowRight size={16} className="text-[#8896b0]/40 transition group-hover:text-[#8896b0]" />
          </button>
        </div>
      </StepShell>
    )
  }

  // Step 4 (join only): Code de la salle
  if (step === "code") {
    const canContinue = joinCode.trim().length >= 4
    return (
      <StepShell step="code" totalSteps={totalSteps} currentIndex={currentIndex} onBack={goBack}>
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl uppercase tracking-[0.04em] text-[#ff2ec8] text-glow-pink sm:text-4xl">Code de la salle</h1>
          <p className="text-sm text-[#8896b0]">Demande le code a ton ami qui a cree la partie.</p>
        </div>

        <div className="mt-10 space-y-6">
          <input
            ref={codeRef}
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={e => {
              if (e.key === "Enter" && canContinue) handleGo()
            }}
            placeholder="EX : A3F7K2"
            maxLength={8}
            className="w-full rounded-xl border border-[#ff2ec8]/20 bg-[rgba(15,5,30,0.85)] backdrop-blur-[16px] px-5 py-4 text-center font-mono text-2xl font-bold tracking-[0.3em] text-[#E0E8F0] outline-none placeholder:text-[#8896b0]/30 placeholder:tracking-[0.15em] placeholder:text-lg placeholder:font-normal focus:border-[#00f7ff] focus:shadow-[0_0_20px_rgba(0,247,255,0.35)]"
            autoComplete="off"
          />
          {joinError ? <p className="text-center text-xs text-red-400">{joinError}</p> : null}
          <button
            type="button"
            disabled={!canContinue || navigating}
            onClick={handleGo}
            className="flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-3.5 text-sm font-semibold text-white transition disabled:opacity-30 bg-[rgba(255,46,200,0.1)] border-[#ff2ec8] text-[#ff2ec8] uppercase tracking-[0.1em] font-display hover:bg-[rgba(255,46,200,0.2)] hover:shadow-[0_0_28px_rgba(255,46,200,0.6),inset_0_0_18px_rgba(255,46,200,0.25)] [text-shadow:0_0_8px_rgba(255,46,200,0.7)]"
          >
            {navigating ? "Chargement..." : "Rejoindre"}
            {!navigating && <ArrowRight size={15} />}
          </button>
        </div>
      </StepShell>
    )
  }

  return null
}

export default function FriendsEntryPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#0a0e17] text-sm text-[#8896b0]">Chargement...</div>}>
      <FriendsEntryContent />
    </Suspense>
  )
}
