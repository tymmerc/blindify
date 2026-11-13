"use client"

import { ThemeButton } from "@/components/ThemeButton"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Plus, LogIn, Check, ExternalLink, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { recognizeMusicLink } from "@/lib/musicLink"
import { YOUTUBE_REFUSAL, youtubeDetail, youtubeSummary, type YoutubeImportReport } from "@/lib/youtubeImport"
import { publicPath } from "@/lib/publicPath"
import { DiscordHint } from "@/components/DiscordPlay"
import { findHostedRoom } from "@/lib/hostedRooms"
import { ApiError } from "@/lib/apiClient"
import { createRoute, parsePreferredMode, situationFor, type SituationMode } from "@/lib/playSituations"
import { InAppBrowserNote } from "@/components/account/InAppBrowserNote"

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
            className="h-8 w-8 object-contain sm:h-10 sm:w-10 dark:hidden"
          />
          <img
            src={publicPath("/logo-mark-nuit.png")}
            alt="Blindz"
            className="h-8 w-8 object-contain sm:h-10 sm:w-10 hidden dark:block"
          />
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
        {/* La FAQ en petit rond « ? » dans le coin (demande de Tym, 05/11) : le lien
            texte sous le bouton chargeait l'ecran. Reste un vrai lien, decouvrable
            par les crawlers (le sitemap ne suffit pas toujours). */}
        {/* Rond clair / sombre (T30), range au-dessus du « ? ». */}
        <ThemeButton className="fixed bottom-16 right-4 z-30 sm:bottom-[4.5rem] sm:right-6" />
        <a
          href={publicPath("/faq/")}
          aria-label="Questions fréquentes"
          title="Questions fréquentes"
          data-testid="jouer-faq"
          className="fixed bottom-4 right-4 z-30 flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-line bg-paper-deep font-display text-base font-bold text-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition hover:bg-ink-block hover:text-on-ink sm:bottom-6 sm:right-6"
        >
          ?
        </a>
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
  const [youtube, setYoutube] = useState<YoutubeImportReport | null>(null)
  const [going, setGoing] = useState(false)
  const [code, setCode] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [joinParam, setJoinParam] = useState("") // ?join=CODE (scan du QR "Autour d'une table")
  // ?mode=event : venu d'une page guide (tele, soiree...), on va tout droit au bon mode.
  const [preferredMode, setPreferredMode] = useState<SituationMode | null>(null)
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
      setPreferredMode(parsePreferredMode(new URLSearchParams(window.location.search).get("mode")))
    } catch { /* ignore */ }
    // On ne cree AUCUN compte tant que le pseudo n'est pas connu. Avant, la
    // simple ouverture de la page fabriquait un invite nomme "Joueur" : 97
    // comptes anonymes en base, indiscernables les uns des autres. Un visiteur
    // qui revient (pseudo en memoire) retrouve bien sa session tout de suite.
    ;(async () => {
      if (!storedName.trim()) return
      try { await api.ensureUserSession(storedName.trim()) } catch { /* ignore */ }
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

  // Le pseudo est obligatoire : le bouton du premier ecran reste desactive
  // sous deux caracteres, et on ne cree jamais de session sans lui.
  const ensureName = async () => {
    const pseudo = name.trim()
    if (!pseudo) return
    try { localStorage.setItem(NAME_KEY, pseudo) } catch { /* ignore */ }
    try { await api.ensureUserSession(pseudo) } catch { /* ignore */ }
  }

  // Importe la musique puis affiche la confirmation. Le meme bouton sert ensuite a continuer.
  const doImport = async () => {
    // Le lien normalise quand on le reconnait (https, lien court des applis compris), sinon tel quel.
    const found = recognizeMusicLink(url)
    const link = found.kind === "ok" || found.kind === "short" ? found.url : url.trim()
    if (!link) { setStep("action"); return }
    setImporting(true)
    setImportError(null)
    const isYoutube = found.kind === "ok" && found.provider === "youtube"
    setYoutube(null)
    try {
      const res = await api.importPlaylists(link)
      const ids = (res.playlists || []).map(pl => pl.id)
      let count = 0
      let report: YoutubeImportReport | null = null
      if (ids.length) {
        const sync = await api.importSyncAll(res.provider, ids, 50, res.linkId)
        count = sync.synced ?? 0
        report = sync.youtube ?? null
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
      setYoutube(report)
      try { localStorage.setItem(URL_KEY, link) } catch { /* ignore */ }
      // Enchaine tout seul sur l'etape suivante (court instant pour voir la confirmation)
      // -> plus besoin d'un 2e clic sur "Continuer".
      setImporting(false)
      // Apres import : en mode normal on avance a l'etape action, en mode join on rejoint direct.
      // YouTube : un peu plus long, le temps de lire combien de morceaux on a retrouves.
      setTimeout(() => { if (joinParam) { void handleJoin() } else { setStep("action") } }, report ? 2600 : 1150)
      return
    } catch (err) {
      // Le serveur dit quoi faire (lien court, playlist privee ou vide, service
      // qui ne repond pas, YouTube). Sans reponse de sa part : un message general.
      const message = err instanceof Error ? err.message : ""
      const fromServer = (err instanceof ApiError && Boolean(err.code)) || isYoutube
      setImportError(fromServer && message
        ? message
        : "Ce lien n'a pas marché. Vérifie que la playlist est publique, puis colle-le à nouveau.")
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
    router.push(createRoute(preferredMode, name))
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
    } catch (err) {
      const gone = err instanceof ApiError && err.status === 404
      // Salle effacee que ce navigateur avait creee : l'ecran de la salle explique
      // et propose d'en rouvrir une pareille (T7).
      const mine = gone ? findHostedRoom(c) : null
      if (mine) {
        router.push(`/multiplayer?mode=${mine.mode}&code=${encodeURIComponent(c)}`)
        return
      }
      setGoing(false)
      setCodeError(
        gone
          ? "Cette salle n'existe plus : elle se ferme toute seule si aucune partie n'y est lancée pendant une demi-heure. Demande le nouveau code."
          : "Salle introuvable. Vérifie le code."
      )
    }
  }

  // ── Étape 1 : Nom ──
  if (step === "nom") {
    const ok = name.trim().length >= 2
    return (
      <Shell dots={3} index={0} onBack={null}>
        <div className="space-y-3 text-center">
          {/* Phrase de positionnement (SEO + les visiteurs comprennent direct) */}
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-terra-txt">
            Le blind test avec tes propres musiques
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
            Comment tu t'<em className="font-medium italic text-terra-txt">appelles</em> ?
          </h1>
          <p className="text-sm text-ink-2">C'est le nom que les autres verront.</p>
          <InAppBrowserNote className="mx-auto max-w-xs pt-1" />
        </div>
        <div className="mt-10 space-y-6">
          <input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && ok) { void ensureName(); setStep("musique") } }}
            placeholder="Ton nom"
            maxLength={24}
            className="w-full border-0 border-b-2 border-line bg-transparent px-2 py-3 text-center font-display text-2xl text-ink outline-none placeholder:italic placeholder:text-pale focus:border-terra"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={!ok}
            /* On enregistre le joueur des que son pseudo est valide. Attendre
               l'etape suivante laissait sans identite quiconque saute l'import
               de musique, et le pseudo est deja connu ici. */
            onClick={() => { void ensureName(); setStep("musique") }}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-line bg-terra px-5 py-4 text-sm font-bold text-on-ink shadow-[4px_4px_0_rgb(var(--c-shadow))] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continuer
            <ArrowRight size={15} />
          </button>
          {/* Pas pour un QR scanne : ce joueur rejoint une partie deja lancee. */}
          {joinParam ? null : <DiscordHint className="pt-2 text-center" />}
        </div>
      </Shell>
    )
  }

  // ── Étape 2 : Musique (un seul bouton : importe puis continue) ──
  if (step === "musique") {
    const trimmedUrl = url.trim()
    const hasContent = trimmedUrl.length > 0
    // Memes formes que le serveur, liens courts des applis compris (lib/musicLink).
    const recognition = recognizeMusicLink(trimmedUrl)
    const recognized = recognition.kind
    const linkValid = recognized === "ok" || recognized === "short"
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
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
            Ta <em className="font-medium italic text-terra-txt">musique</em>
          </h1>
          <p className="text-sm text-ink-2">Colle ton lien Spotify, Deezer ou YouTube pour jouer avec tes propres titres.</p>
        </div>
        {/* Sur PC : saisie a gauche, aides/tutos en colonne a droite. Mobile : pile inchangee. */}
        <div className="mt-9 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-10">
          <div className="relative lg:col-start-1 lg:row-start-1">
            <input
              value={url}
              onChange={e => { setUrl(e.target.value); setSynced(null); setImportError(null) }}
              onKeyDown={e => { if (e.key === "Enter") onPrimary() }}
              placeholder="https://open.spotify.com/..."
              className="w-full rounded-md border-2 border-line bg-well py-5 pl-4 pr-24 text-base text-ink outline-none transition placeholder:italic placeholder:text-pale focus:border-terra"
              autoComplete="off"
              inputMode="url"
            />
            <button
              type="button"
              onClick={handlePaste}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border-2 border-line bg-paper-deep px-3 py-2 text-[13px] font-bold text-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_rgb(var(--c-shadow))]"
            >
              Coller
            </button>
          </div>

          <div className="mt-5 space-y-2.5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:rounded-md lg:border-[1.5px] lg:border-[rgb(var(--c-line)/.25)] lg:bg-paper-deep lg:p-5">
            <p className="text-center text-[12px] text-ink-2">Besoin de ton lien&nbsp;?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {/* Nouvel onglet : on ne perd JAMAIS le wizard Blindz derriere. Le rebond
                  app<->web est le comportement de Spotify/Deezer, pas le notre. */}
              <a
                href="https://open.spotify.com/collection/playlists"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-line bg-paper-deep px-3 py-1.5 text-[12px] font-bold text-ink transition hover:bg-ink-block hover:text-on-ink"
              >
                Ouvrir Spotify <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://www.deezer.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-line bg-paper-deep px-3 py-1.5 text-[12px] font-bold text-ink transition hover:bg-ink-block hover:text-on-ink"
              >
                Ouvrir Deezer <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex justify-center gap-4 text-[12px] font-semibold">
              <button type="button" onClick={() => setTuto(t => (t === "spotify" ? null : "spotify"))} className="underline decoration-[1.5px] underline-offset-2 text-ink-2 transition hover:text-ink">
                Comment copier mon lien Spotify&nbsp;?
              </button>
            </div>
            <div className="flex justify-center text-[12px] font-semibold">
              <button type="button" onClick={() => setTuto(t => (t === "deezer" ? null : "deezer"))} className="underline decoration-[1.5px] underline-offset-2 text-ink-2 transition hover:text-ink">
                Comment copier mon lien Deezer&nbsp;?
              </button>
            </div>
            {tuto && (
              <ol className="mx-auto max-w-sm space-y-1.5 rounded-xl border-[1.5px] border-line bg-paper-deep p-4 text-left text-[13px] text-ink-2">
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
                    <span className="font-bold text-terra-txt">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="mt-5 space-y-4 lg:col-start-1 lg:row-start-2">
          {importError && <p className="text-center text-[12px] font-bold text-rouge-txt">{importError}</p>}
          {formatError && !importError && (
            <p className="text-center text-[12px] font-bold text-rouge-txt">
              {recognition.kind === "refused"
                ? YOUTUBE_REFUSAL[recognition.reason]
                : "Lien non reconnu. Mets un lien de playlist Spotify, Deezer ou YouTube, ou de profil Spotify ou Deezer."}
            </p>
          )}

          {/* Le bouton SE TRANSFORME en confirmation verte quand l'import reussit (anim) */}
          <button
            type="button"
            disabled={importing || going || formatError}
            onClick={onPrimary}
            className={`flex w-full items-center justify-center gap-2 overflow-hidden rounded-md border-2 border-line px-5 py-4 text-base font-bold text-on-ink shadow-[4px_4px_0_rgb(var(--c-shadow))] transition-all duration-300 disabled:cursor-default ${
              synced !== null
                ? "scale-[1.02] bg-sage hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))]"
                : "bg-terra hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))] disabled:opacity-60"
            }`}
          >
            {synced !== null ? (
              // Reste cliquable : si on revient en arriere apres l'auto-avance, ce
              // bouton sert de "Continuer" (sinon on etait coince sur cette etape).
              <span key="done" className="flex items-center gap-2 duration-300 animate-in fade-in zoom-in-95">
                <Check size={18} className="duration-500 animate-in zoom-in spin-in-45" />
                {youtube ? youtubeSummary(youtube) : `${synced} titre${synced > 1 ? "s" : ""} importé${synced > 1 ? "s" : ""}`} · Continuer
                <ArrowRight size={16} />
              </span>
            ) : importing ? (
              <span className="animate-pulse">
                {recognition.kind === "ok" && recognition.provider === "youtube" ? "On retrouve tes morceaux chez Deezer..." : "Import en cours..."}
              </span>
            ) : going ? (
              <span>Connexion...</span>
            ) : (
              <span className="flex items-center gap-2">
                {needsImport ? "Importer ma musique" : joinParam ? "Rejoindre la partie" : "Continuer"}
                <ArrowRight size={16} />
              </span>
            )}
          </button>
          {synced !== null && youtube && youtubeDetail(youtube) && (
            <p className="text-center text-[12px] text-ink-2" role="status">{youtubeDetail(youtube)}</p>
          )}
          <p className="text-center text-[11px] text-sourd">
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
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
            Tu veux <em className="font-medium italic text-terra-txt">jouer</em> comment ?
          </h1>
          <p className="text-sm text-ink-2">
            {preferredMode
              ? `Tu crées une partie « ${situationFor(preferredMode).modeName} », ou tu rejoins celle d'un ami.`
              : "Lance une nouvelle partie, ou rejoins celle d'un ami."}
          </p>
        </div>
        <div className="mt-10 space-y-3">
          <button
            type="button"
            disabled={going}
            onClick={handleCreate}
            className={`flex w-full items-center justify-between gap-3 rounded-md border-2 border-line bg-terra px-5 py-4 text-left font-bold text-on-ink shadow-[4px_4px_0_rgb(var(--c-shadow))] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))] disabled:cursor-default disabled:opacity-100 ${going ? "animate-pulse" : ""}`}
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
            className="flex w-full items-center justify-between gap-3 rounded-md border-2 border-line bg-paper-deep px-5 py-4 text-left font-bold text-ink shadow-[4px_4px_0_rgb(var(--c-shadow)/.22)] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow)/.22)] disabled:opacity-50"
          >
            <span className="flex items-center gap-3"><LogIn size={18} /> Rejoindre avec un code</span>
            <ArrowRight size={16} />
          </button>
          {preferredMode ? (
            <p className="pt-2 text-center text-[12px] text-sourd">
              <button
                type="button"
                onClick={() => setPreferredMode(null)}
                className="underline decoration-[1.5px] underline-offset-2 transition hover:text-ink"
              >
                Voir les autres façons de jouer
              </button>
            </p>
          ) : null}
        </div>
      </Shell>
    )
  }

  // ── Étape 4 : Code (rejoindre) ──
  return (
    <Shell dots={4} index={3} onBack={() => { setCode(""); setCodeError(null); setStep("action") }}>
      <div className="space-y-3 text-center">
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">
          Le <em className="font-medium italic text-terra-txt">code</em> de la partie
        </h1>
        <p className="text-sm text-ink-2">Demande-le à la personne qui a créé la partie.</p>
      </div>
      <div className="mt-10 space-y-4">
        <input
          ref={codeRef}
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)); setCodeError(null) }}
          onKeyDown={e => { if (e.key === "Enter") handleJoin() }}
          placeholder="CODE"
          className="w-full rounded-md border-2 border-line bg-well px-4 py-4 text-center font-display text-3xl font-semibold uppercase tracking-[0.4em] text-ink outline-none placeholder:text-base placeholder:tracking-[0.2em] placeholder:italic placeholder:text-pale focus:border-terra"
          autoComplete="off"
        />
        {codeError && <p className="text-center text-[12px] font-bold text-rouge-txt">{codeError}</p>}
        <button
          type="button"
          disabled={going || code.trim().length < 4}
          onClick={handleJoin}
          className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-line bg-terra px-5 py-4 text-sm font-bold text-on-ink shadow-[4px_4px_0_rgb(var(--c-shadow))] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {going ? "Connexion..." : "Rejoindre"}
          {!going && <ArrowRight size={15} />}
        </button>
      </div>
    </Shell>
  )
}
