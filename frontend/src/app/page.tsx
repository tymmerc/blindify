"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Plus, LogIn, Check, ExternalLink, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { publicPath } from "@/lib/publicPath"

const NAME_KEY = "blindify_nickname"
const URL_KEY = "blindify_profile_url"

type Step = "nom" | "musique" | "action" | "code"

function Shell({ dots, index, onBack, wide, children }: { dots: number; index: number; onBack: (() => void) | null; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-5 pt-6 pb-8 sm:min-h-screen sm:flex-row sm:items-center sm:justify-center sm:py-10">
      <div className={`mx-auto flex w-full max-w-md flex-1 flex-col sm:block sm:flex-none ${wide ? "lg:max-w-4xl" : ""}`}>
        <div className="flex h-8 shrink-0 items-center justify-between sm:mb-8 sm:h-auto">
          <img
            src={publicPath("/logo-mark.png")}
            alt="Blindz"
            className="h-8 w-8 object-contain sm:h-10 sm:w-10"
          />
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb] sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-[0.14em]"
            >
              <ArrowLeft size={11} />
              Retour
            </button>
          ) : (
            <span />
          )}
        </div>
        <div className="mb-10 mt-8 flex shrink-0 items-center justify-center gap-1.5 sm:mt-0">
          {Array.from({ length: dots }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === index ? 26 : 8, background: i <= index ? "#c65133" : "rgba(46,32,20,.22)" }}
            />
          ))}
        </div>
        <div className="flex flex-1 flex-col justify-center animate-in fade-in slide-in-from-right-4 duration-300 sm:block sm:flex-none">{children}</div>
        {/* Lien decouvrable par les crawlers (le sitemap ne suffit pas toujours) */}
        <p className="mt-6 shrink-0 text-center text-[11px] text-[#b3a182]">
          <a href="/faq/" className="underline hover:text-[#6b573f]">Questions fréquentes</a>
        </p>
      </div>
    </div>
  )
}

export default function EntryWizard() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("nom")
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [importing, setImporting] = useState(false)
  const [synced, setSynced] = useState<number | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [going, setGoing] = useState(false)
  const [code, setCode] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [joinParam, setJoinParam] = useState("") // ?join=CODE (scan du QR "Autour d'une table")
  const [tuto, setTuto] = useState<null | "spotify" | "deezer">(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    let storedName = ""
    try {
      storedName = localStorage.getItem(NAME_KEY) ?? ""
      setName(storedName)
      setUrl(localStorage.getItem(URL_KEY) ?? "")
    } catch { /* ignore */ }
    try {
      const j = (new URLSearchParams(window.location.search).get("join") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
      if (j) { setJoinParam(j); setCode(j) }
    } catch { /* ignore */ }
    ;(async () => {
      try { await api.ensureUserSession(storedName.trim() || "Joueur") } catch { /* ignore */ }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      if (step === "nom") nameRef.current?.focus()
      if (step === "code") codeRef.current?.focus()
    }, 120)
    return () => clearTimeout(t)
  }, [step])

  useEffect(() => {
    try { if (name.trim()) localStorage.setItem(NAME_KEY, name.trim()) } catch { /* ignore */ }
  }, [name])

  const ensureName = async () => {
    try { if (name.trim()) localStorage.setItem(NAME_KEY, name.trim()) } catch { /* ignore */ }
    try { await api.ensureUserSession(name.trim() || "Joueur") } catch { /* ignore */ }
  }

  // Importe la musique puis affiche la confirmation. Le meme bouton sert ensuite a continuer.
  const doImport = async () => {
    const link = url.trim()
    if (!link) { setStep("action"); return }
    setImporting(true)
    setImportError(null)
    try {
      const res = await api.importPlaylists(link)
      const ids = (res.playlists || []).map(pl => pl.id)
      let count = 0
      if (ids.length) {
        const sync = await api.importSyncAll(res.provider, ids, 50)
        count = sync.synced ?? 0
      }
      // 0 titre = echec silencieux : avant, on affichait fierement "0 titres
      // importes" en vert et on continuait, le joueur croyait avoir sa musique.
      if (count === 0) {
        setImportError(
          ids.length === 0
            ? "Aucune playlist publique trouvée sur ce profil. Vérifie que tes playlists sont publiques, ou colle le lien d'une playlist."
            : "Aucun titre n'a pu être récupéré pour l'instant. Réessaie dans un moment."
        )
        setImporting(false)
        return
      }
      setSynced(count)
      try { localStorage.setItem(URL_KEY, link) } catch { /* ignore */ }
      // Enchaine tout seul sur l'etape suivante (court instant pour voir la confirmation)
      // -> plus besoin d'un 2e clic sur "Continuer".
      setImporting(false)
      // Apres import : en mode normal on avance a l'etape action, en mode join on rejoint direct.
      setTimeout(() => { if (joinParam) { void handleJoin() } else { setStep("action") } }, 1150)
      return
    } catch {
      setImportError("Lien invalide ou profil privé. Vérifie le lien.")
    }
    setImporting(false)
  }

  // CRÉER : on va choisir le mode
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && text.trim()) {
        setUrl(text.trim())
        setSynced(null)
        setImportError(null)
      }
    } catch {
      // Presse-papier non accessible (permission refusee / navigateur) : on ignore.
    }
  }

  const handleCreate = async () => {
    if (going) return
    setGoing(true)
    await ensureName()
    router.push("/modes")
  }

  // REJOINDRE : on résout le mode de la room depuis le code, sans jamais voir les modes
  const handleJoin = async () => {
    if (going) return
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "")
    if (c.length < 4) { setCodeError("Entre un code valide."); return }
    setGoing(true)
    setCodeError(null)
    await ensureName()
    try {
      const { room } = await api.roomDetails(c)
      const roomMode = (room as { mode?: string }).mode || "friends"
      const nick = name.trim() ? `&nickname=${encodeURIComponent(name.trim())}` : ""
      router.push(`/multiplayer?mode=${roomMode}&code=${encodeURIComponent(c)}${nick}`)
    } catch {
      setGoing(false)
      setCodeError("Salle introuvable. Vérifie le code.")
    }
  }

  // ── Étape 1 : Nom ──
  if (step === "nom") {
    const ok = name.trim().length >= 2
    return (
      <Shell dots={3} index={0} onBack={null}>
        <div className="space-y-3 text-center">
          {/* Phrase de positionnement (SEO + les visiteurs comprennent direct) */}
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#c65133]">
            Le blind test avec tes propres musiques
          </p>
          <h1 className="font-display text-3xl font-semibold text-[#2e2014] sm:text-4xl">
            Comment tu t'<em className="font-medium italic text-[#c65133]">appelles</em> ?
          </h1>
          <p className="text-sm text-[#6b573f]">C'est le nom que les autres verront.</p>
        </div>
        <div className="mt-10 space-y-6">
          <input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && ok) setStep("musique") }}
            placeholder="Ton nom"
            maxLength={24}
            className="w-full border-0 border-b-2 border-[#2e2014] bg-transparent px-2 py-3 text-center font-display text-2xl text-[#2e2014] outline-none placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={!ok}
            onClick={() => setStep("musique")}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-4 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continuer
            <ArrowRight size={15} />
          </button>
        </div>
      </Shell>
    )
  }

  // ── Étape 2 : Musique (un seul bouton : importe puis continue) ──
  if (step === "musique") {
    const trimmedUrl = url.trim()
    const hasContent = trimmedUrl.length > 0
    const linkValid = /^https?:\/\/(open\.spotify\.com\/(playlist|user)\/|(www\.)?deezer\.com\/(\w\w\/)?(playlist|profile)\/)/i.test(trimmedUrl)
    // Tout texte non vide doit etre un lien valide. Champ vide = on peut continuer sans musique.
    const formatError = hasContent && !linkValid
    const needsImport = linkValid && synced === null
    // En mode scan QR (joinParam) on rejoint directement, sinon on choisit creer/rejoindre.
    const proceed = joinParam ? handleJoin : () => setStep("action")
    const onPrimary = () => {
      if (formatError) return // lien invalide : on bloque (clic ET Entree)
      if (needsImport) { doImport(); return }
      proceed()
    }
    return (
      <Shell dots={3} index={1} onBack={() => setStep("nom")} wide>
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl font-semibold text-[#2e2014] sm:text-4xl">
            Ta <em className="font-medium italic text-[#c65133]">musique</em>
          </h1>
          <p className="text-sm text-[#6b573f]">Colle ton lien Spotify ou Deezer pour jouer avec tes propres titres.</p>
        </div>
        {/* Sur PC : saisie a gauche, aides/tutos en colonne a droite. Mobile : pile inchangee. */}
        <div className="mt-9 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-10">
          <div className="relative lg:col-start-1 lg:row-start-1">
            <input
              value={url}
              onChange={e => { setUrl(e.target.value); setSynced(null); setImportError(null) }}
              onKeyDown={e => { if (e.key === "Enter") onPrimary() }}
              placeholder="https://open.spotify.com/..."
              className="w-full rounded-md border-2 border-[#2e2014] bg-[#efe5d0] py-5 pl-4 pr-24 text-base text-[#2e2014] outline-none transition placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
              autoComplete="off"
              inputMode="url"
            />
            <button
              type="button"
              onClick={handlePaste}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-3 py-2 text-[13px] font-bold text-[#2e2014] shadow-[2px_2px_0_#2e2014] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#2e2014]"
            >
              Coller
            </button>
          </div>

          <div className="mt-5 space-y-2.5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:rounded-md lg:border-[1.5px] lg:border-[rgba(46,32,20,.25)] lg:bg-[#ece1c8] lg:p-5">
            <p className="text-center text-[12px] text-[#6b573f]">Besoin de ton lien&nbsp;?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {/* Nouvel onglet : on ne perd JAMAIS le wizard Blindz derriere. Le rebond
                  app<->web est le comportement de Spotify/Deezer, pas le notre. */}
              <a
                href="https://open.spotify.com/collection/playlists"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-3 py-1.5 text-[12px] font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
              >
                Ouvrir Spotify <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://www.deezer.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-3 py-1.5 text-[12px] font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
              >
                Ouvrir Deezer <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex justify-center gap-4 text-[12px] font-semibold">
              <button type="button" onClick={() => setTuto(t => (t === "spotify" ? null : "spotify"))} className="underline decoration-[1.5px] underline-offset-2 text-[#6b573f] transition hover:text-[#2e2014]">
                Comment copier mon lien Spotify&nbsp;?
              </button>
            </div>
            <div className="flex justify-center text-[12px] font-semibold">
              <button type="button" onClick={() => setTuto(t => (t === "deezer" ? null : "deezer"))} className="underline decoration-[1.5px] underline-offset-2 text-[#6b573f] transition hover:text-[#2e2014]">
                Comment copier mon lien Deezer&nbsp;?
              </button>
            </div>
            {tuto && (
              <ol className="mx-auto max-w-sm space-y-1.5 rounded-xl border-[1.5px] border-[#2e2014] bg-[#ece1c8] p-4 text-left text-[13px] text-[#6b573f]">
                {(tuto === "spotify"
                  ? [
                      "Ouvre Spotify et va sur ton profil (ton nom en haut).",
                      "Touche les trois points ··· puis « Partager ».",
                      "Choisis « Copier le lien du profil ».",
                      "Reviens ici et colle le lien au-dessus.",
                    ]
                  : [
                      "Ouvre Deezer et va sur ton profil.",
                      "Touche « Partager » (ou les trois points ···).",
                      "Choisis « Copier le lien ».",
                      "Reviens ici et colle le lien au-dessus.",
                    ]
                ).map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-bold text-[#c65133]">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="mt-5 space-y-4 lg:col-start-1 lg:row-start-2">
          {importError && <p className="text-center text-[12px] font-bold text-[#9c2f1d]">{importError}</p>}
          {formatError && !importError && <p className="text-center text-[12px] font-bold text-[#9c2f1d]">Lien non reconnu. Mets un lien de playlist ou profil Spotify ou Deezer.</p>}

          {/* Le bouton SE TRANSFORME en confirmation verte quand l'import reussit (anim) */}
          <button
            type="button"
            disabled={importing || going || formatError}
            onClick={onPrimary}
            className={`flex w-full items-center justify-center gap-2 overflow-hidden rounded-md border-2 border-[#2e2014] px-5 py-4 text-base font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition-all duration-300 disabled:cursor-default ${
              synced !== null
                ? "scale-[1.02] bg-[#7d9471] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
                : "bg-[#c65133] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:opacity-60"
            }`}
          >
            {synced !== null ? (
              // Reste cliquable : si on revient en arriere apres l'auto-avance, ce
              // bouton sert de "Continuer" (sinon on etait coince sur cette etape).
              <span key="done" className="flex items-center gap-2 duration-300 animate-in fade-in zoom-in-95">
                <Check size={18} className="duration-500 animate-in zoom-in spin-in-45" />
                {synced} titre{synced > 1 ? "s" : ""} importé{synced > 1 ? "s" : ""} · Continuer
                <ArrowRight size={16} />
              </span>
            ) : importing ? (
              <span className="animate-pulse">Import en cours...</span>
            ) : going ? (
              <span>Connexion...</span>
            ) : (
              <span className="flex items-center gap-2">
                {needsImport ? "Importer ma musique" : joinParam ? "Rejoindre la partie" : "Continuer"}
                <ArrowRight size={16} />
              </span>
            )}
          </button>
          <p className="text-center text-[11px] text-[#8a7558]">
            Pas de lien ? Tu peux continuer : il suffit qu&apos;une personne ramène une playlist (2 joueurs minimum).
          </p>
          </div>
        </div>
      </Shell>
    )
  }

  // ── Étape 3 : Créer ou Rejoindre ──
  if (step === "action") {
    return (
      <Shell dots={3} index={2} onBack={() => setStep("musique")}>
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl font-semibold text-[#2e2014] sm:text-4xl">
            Tu veux <em className="font-medium italic text-[#c65133]">jouer</em> comment ?
          </h1>
          <p className="text-sm text-[#6b573f]">Lance une nouvelle partie, ou rejoins celle d'un ami.</p>
        </div>
        <div className="mt-10 space-y-3">
          <button
            type="button"
            disabled={going}
            onClick={handleCreate}
            className={`flex w-full items-center justify-between gap-3 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-4 text-left font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:cursor-default disabled:opacity-100 ${going ? "animate-pulse" : ""}`}
          >
            {going ? (
              <span className="flex w-full items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin" /> Création de la partie...
              </span>
            ) : (
              <>
                <span className="flex items-center gap-3"><Plus size={18} /> Créer une partie</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
          <button
            type="button"
            disabled={going}
            onClick={() => setStep("code")}
            className="flex w-full items-center justify-between gap-3 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-5 py-4 text-left font-bold text-[#2e2014] shadow-[4px_4px_0_rgba(46,32,20,.22)] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgba(46,32,20,.22)] disabled:opacity-50"
          >
            <span className="flex items-center gap-3"><LogIn size={18} /> Rejoindre avec un code</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </Shell>
    )
  }

  // ── Étape 4 : Code (rejoindre) ──
  return (
    <Shell dots={4} index={3} onBack={() => { setCode(""); setCodeError(null); setStep("action") }}>
      <div className="space-y-3 text-center">
        <h1 className="font-display text-3xl font-semibold text-[#2e2014] sm:text-4xl">
          Le <em className="font-medium italic text-[#c65133]">code</em> de la partie
        </h1>
        <p className="text-sm text-[#6b573f]">Demande-le à la personne qui a créé la partie.</p>
      </div>
      <div className="mt-10 space-y-4">
        <input
          ref={codeRef}
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)); setCodeError(null) }}
          onKeyDown={e => { if (e.key === "Enter") handleJoin() }}
          placeholder="CODE"
          className="w-full rounded-md border-2 border-[#2e2014] bg-[#efe5d0] px-4 py-4 text-center font-display text-3xl font-semibold uppercase tracking-[0.4em] text-[#2e2014] outline-none placeholder:text-base placeholder:tracking-[0.2em] placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133]"
          autoComplete="off"
        />
        {codeError && <p className="text-center text-[12px] font-bold text-[#9c2f1d]">{codeError}</p>}
        <button
          type="button"
          disabled={going || code.trim().length < 4}
          onClick={handleJoin}
          className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-4 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {going ? "Connexion..." : "Rejoindre"}
          {!going && <ArrowRight size={15} />}
        </button>
      </div>
    </Shell>
  )
}
