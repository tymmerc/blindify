"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Users, LogIn, Music } from "lucide-react"
import { useMode } from "@/contexts/ModeContext"
import { api } from "@/lib/api"
import { DiscordHint } from "@/components/DiscordPlay"

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
    <div className="flex min-h-dvh flex-col px-5 pt-6 pb-8 sm:min-h-screen sm:flex-row sm:items-center sm:justify-center sm:py-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col sm:block sm:flex-none">
        {/* Top bar */}
        <div className="flex h-7 shrink-0 items-center justify-between sm:mb-8 sm:h-auto">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 rounded-full border-[1.5px] border-line bg-paper-deep px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink transition hover:bg-ink-block hover:text-on-ink sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-[0.14em]"
            >
              <ArrowLeft size={11} />
              Retour
            </button>
          ) : (
            <span />
          )}
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-terra-txt">Friends · Mode</p>
        </div>

        {/* Progress dots */}
        <div className="mb-10 mt-8 flex shrink-0 items-center justify-center gap-1.5 sm:mt-0">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <StepDot key={i} active={i === currentIndex} done={i < currentIndex} />
          ))}
        </div>

        {/* Step content */}
        <div className="flex flex-1 flex-col justify-center animate-in fade-in slide-in-from-right-4 duration-300 sm:block sm:flex-none">{children}</div>
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
      await api.ensureUserSession(nickname.trim() || undefined)
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
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Comment tu t'<em className="font-medium italic text-terra-txt">appelles</em> ?</h1>
          <p className="text-sm text-ink-2">C'est le nom que tes rivaux verront.</p>
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
            className="w-full border-0 border-b-2 border-line bg-transparent px-2 py-3 text-center font-display text-2xl text-ink outline-none placeholder:italic placeholder:text-pale focus:border-terra"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={!canContinue}
            onClick={goNext}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-line bg-terra px-5 py-3.5 text-sm font-bold text-on-ink shadow-[4px_4px_0_rgb(var(--c-shadow))] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))] disabled:cursor-not-allowed disabled:opacity-40"
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
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Ta <em className="font-medium italic text-terra-txt">musique</em></h1>
          <p className="text-sm text-ink-2">
            Colle ton lien de profil Spotify ou Deezer, ou d'une playlist YouTube, pour jouer avec tes propres playlists.
          </p>
        </div>

        <div className="mt-10 space-y-4">
          <div className="relative">
            <Music size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-sourd" />
            <input
              ref={musicRef}
              value={profileUrl}
              onChange={e => setProfileUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleMusicNext()
              }}
              placeholder="https://open.spotify.com/user/..."
              className="w-full rounded-md border-[1.5px] border-[rgb(var(--c-line)/.35)] bg-well py-4 pl-10 pr-5 text-sm text-ink outline-none placeholder:italic placeholder:text-pale focus:border-terra"
              autoComplete="off"
            />
          </div>

          <button
            type="button"
            disabled={isLastStep && navigating}
            onClick={handleMusicNext}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-line bg-terra px-5 py-3.5 text-sm font-bold text-on-ink shadow-[4px_4px_0_rgb(var(--c-shadow))] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {navigating && isLastStep ? "Chargement..." : buttonLabel}
            {!(navigating && isLastStep) && <ArrowRight size={15} />}
          </button>

          {!profileUrl.trim() && (
            <button
              type="button"
              disabled={isLastStep && navigating}
              onClick={handleMusicNext}
              className="w-full py-2 text-xs font-medium text-sourd transition hover:text-ink"
            >
              {isLastStep ? "Rejoindre sans importer" : "Passer cette étape"}
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-[10px] text-sourd">
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
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Qu'est-ce que tu veux <em className="font-medium italic text-terra-txt">faire</em> ?</h1>
          <p className="text-sm text-ink-2">Lance un blind test avec tes amis.</p>
        </div>

        <div className="mt-10 grid gap-3">
          <button
            type="button"
            disabled={navigating}
            onClick={async () => {
              if (navigating) return
              setNavigating(true)
              setMode("friends")
              try { await api.ensureUserSession(nickname.trim() || undefined) } catch {}
              const nicknameParam = nickname.trim() ? `&nickname=${encodeURIComponent(nickname.trim())}` : ""
              const profileParam = profileUrl.trim() ? `&profileUrl=${encodeURIComponent(profileUrl.trim())}` : ""
              await router.push(`/multiplayer?mode=friends&intent=host${nicknameParam}${profileParam}`)
            }}
            className="group flex items-center gap-4 rounded-md border-2 border-line bg-paper-deep px-6 py-5 text-left shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow)/.18)]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-line bg-terra transition group-hover:scale-105">
              <Users size={20} className="text-on-ink" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">Créer une partie</p>
              <p className="mt-0.5 text-xs text-ink-2">Deviens hôte, partage le code à tes amis.</p>
            </div>
            <ArrowRight size={16} className="text-sourd transition group-hover:text-ink" />
          </button>

          <button
            type="button"
            onClick={() => {
              setIntent("join")
              setStep("code")
            }}
            className="group flex items-center gap-4 rounded-md border-2 border-line bg-paper-deep px-6 py-5 text-left shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow)/.18)]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-line bg-ink-block transition group-hover:scale-105">
              <LogIn size={20} className="text-on-ink" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">Rejoindre une partie</p>
              <p className="mt-0.5 text-xs text-ink-2">Un ami t'a envoyé un code ? Entre-le ici.</p>
            </div>
            <ArrowRight size={16} className="text-sourd transition group-hover:text-ink" />
          </button>
        </div>
        {/* Discret, sous les deux choix : en appel Discord, l'Activite evite le code. */}
        <DiscordHint className="mt-6 text-center" />
      </StepShell>
    )
  }

  // Step 4 (join only): Code de la salle
  if (step === "code") {
    const canContinue = joinCode.trim().length >= 4
    return (
      <StepShell step="code" totalSteps={totalSteps} currentIndex={currentIndex} onBack={goBack}>
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Code de la <em className="font-medium italic text-terra-txt">salle</em></h1>
          <p className="text-sm text-ink-2">Demande le code à ton ami qui a créé la partie.</p>
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
            className="w-full rounded-md border-2 border-line bg-well px-5 py-4 text-center font-display text-3xl font-bold tracking-[0.3em] text-ink shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)] outline-none placeholder:font-sans placeholder:text-lg placeholder:font-normal placeholder:italic placeholder:tracking-[0.15em] placeholder:text-pale focus:border-terra"
            autoComplete="off"
          />
          {joinError ? <p className="text-center text-xs font-bold text-rouge-txt">{joinError}</p> : null}
          <button
            type="button"
            disabled={!canContinue || navigating}
            onClick={handleGo}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-line bg-terra px-5 py-3.5 text-sm font-bold text-on-ink shadow-[4px_4px_0_rgb(var(--c-shadow))] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))] disabled:cursor-not-allowed disabled:opacity-40"
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
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-sourd">Chargement...</div>}>
      <FriendsEntryContent />
    </Suspense>
  )
}
