"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Users, LogIn, Music } from "lucide-react"
import { useMode } from "@/contexts/ModeContext"
import { api } from "@/lib/api"

type Intent = "create" | "join" | null
type Step = "nickname" | "music" | "intent" | "code"

const ACCENT = "#c65133"

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div
      className="h-1.5 rounded-full transition-all duration-300"
      style={{
        width: active ? 24 : 8,
        backgroundColor: active ? ACCENT : done ? "rgba(198,81,51,0.5)" : "rgba(46,32,20,0.15)",
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
              className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
            >
              <ArrowLeft size={13} />
              Retour
            </button>
          ) : (
            <span />
          )}
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#c65133]">Friends · Mode</p>
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
  // Nouveau flow : le nom + la musique sont saisis a l'ECRAN D'ENTREE (/). Si le nom est deja
  // connu, on saute directement au choix creer/rejoindre au lieu de redemander nom+musique.
  const [step, setStep] = useState<Step>(() => {
    if (joinParam) return "nickname"
    try { if ((localStorage.getItem("blindify_nickname") ?? "").trim()) return "intent" } catch { /* ignore */ }
    return "nickname"
  })
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

  // Sauvegarde le nom + le lien EN CONTINU (pas seulement a la fin du wizard).
  // Avant, la sauvegarde n'avait lieu que dans handleGo : selon le flow elle pouvait sauter
  // (constate sur Chrome). On persiste a chaque changement, avec try/catch (localStorage peut
  // lever dans certains modes prive/restrictifs).
  useEffect(() => {
    try { if (nickname.trim()) localStorage.setItem("blindify_nickname", nickname.trim()) } catch { /* ignore */ }
  }, [nickname])
  useEffect(() => {
    try { if (profileUrl.trim()) localStorage.setItem("blindify_profile_url", profileUrl.trim()) } catch { /* ignore */ }
  }, [profileUrl])

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
          <h1 className="font-display text-3xl font-semibold text-[#2e2014] sm:text-4xl">Comment tu t'<em className="font-medium italic text-[#c65133]">appelles</em> ?</h1>
          <p className="text-sm text-[#6b573f]">C'est le nom que tes rivaux verront.</p>
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
            className="w-full border-0 border-b-2 border-[#2e2014] bg-transparent px-2 py-3 text-center font-display text-2xl text-[#2e2014] outline-none placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={!canContinue}
            onClick={goNext}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-3.5 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-40"
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
          <h1 className="font-display text-3xl font-semibold text-[#2e2014] sm:text-4xl">Ta <em className="font-medium italic text-[#c65133]">musique</em></h1>
          <p className="text-sm text-[#6b573f]">
            Colle ton lien de profil Spotify ou Deezer pour jouer avec tes propres playlists.
          </p>
        </div>

        <div className="mt-10 space-y-4">
          <div className="relative">
            <Music size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a7558]" />
            <input
              ref={musicRef}
              value={profileUrl}
              onChange={e => setProfileUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleMusicNext()
              }}
              placeholder="https://open.spotify.com/user/..."
              className="w-full rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] py-4 pl-10 pr-5 text-sm text-[#2e2014] outline-none placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
              autoComplete="off"
            />
          </div>

          <button
            type="button"
            disabled={isLastStep && navigating}
            onClick={handleMusicNext}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-3.5 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {navigating && isLastStep ? "Chargement..." : buttonLabel}
            {!(navigating && isLastStep) && <ArrowRight size={15} />}
          </button>

          {!profileUrl.trim() && (
            <button
              type="button"
              disabled={isLastStep && navigating}
              onClick={handleMusicNext}
              className="w-full py-2 text-xs font-medium text-[#8a7558] transition hover:text-[#2e2014]"
            >
              {isLastStep ? "Rejoindre sans importer" : "Passer cette etape"}
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-[10px] text-[#8a7558]">
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
          <h1 className="font-display text-3xl font-semibold text-[#2e2014] sm:text-4xl">Qu'est-ce que tu veux <em className="font-medium italic text-[#c65133]">faire</em> ?</h1>
          <p className="text-sm text-[#6b573f]">Lance un blind test avec tes amis.</p>
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
            className="group flex items-center gap-4 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-6 py-5 text-left shadow-[4px_4px_0_rgba(46,32,20,.18)] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgba(46,32,20,.18)]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#c65133] transition group-hover:scale-105">
              <Users size={20} className="text-[#f4ecdb]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#2e2014]">Creer une partie</p>
              <p className="mt-0.5 text-xs text-[#6b573f]">Deviens hote, partage le code a tes amis.</p>
            </div>
            <ArrowRight size={16} className="text-[#8a7558] transition group-hover:text-[#2e2014]" />
          </button>

          <button
            type="button"
            onClick={() => {
              setIntent("join")
              setStep("code")
            }}
            className="group flex items-center gap-4 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-6 py-5 text-left shadow-[4px_4px_0_rgba(46,32,20,.18)] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgba(46,32,20,.18)]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#2e2014] bg-[#2e2014] transition group-hover:scale-105">
              <LogIn size={20} className="text-[#f4ecdb]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#2e2014]">Rejoindre une partie</p>
              <p className="mt-0.5 text-xs text-[#6b573f]">Un ami t'a envoye un code ? Entre-le ici.</p>
            </div>
            <ArrowRight size={16} className="text-[#8a7558] transition group-hover:text-[#2e2014]" />
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
          <h1 className="font-display text-3xl font-semibold text-[#2e2014] sm:text-4xl">Code de la <em className="font-medium italic text-[#c65133]">salle</em></h1>
          <p className="text-sm text-[#6b573f]">Demande le code a ton ami qui a cree la partie.</p>
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
            className="w-full rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-5 py-4 text-center font-display text-3xl font-bold tracking-[0.3em] text-[#2e2014] shadow-[4px_4px_0_rgba(46,32,20,.18)] outline-none placeholder:font-sans placeholder:text-lg placeholder:font-normal placeholder:italic placeholder:tracking-[0.15em] placeholder:text-[#b3a182] focus:border-[#c65133]"
            autoComplete="off"
          />
          {joinError ? <p className="text-center text-xs font-bold text-[#9c2f1d]">{joinError}</p> : null}
          <button
            type="button"
            disabled={!canContinue || navigating}
            onClick={handleGo}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-3.5 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-40"
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
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-[#8a7558]">Chargement...</div>}>
      <FriendsEntryContent />
    </Suspense>
  )
}
