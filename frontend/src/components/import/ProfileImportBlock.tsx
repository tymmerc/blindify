"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Check, ExternalLink, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { followExternalLink } from "@/lib/externalLink"
import { recognizeMusicLink, type MusicLinkRecognition } from "@/lib/musicLink"

/**
 * Coller un lien de playlist ou de profil (lobby, « Ta musique » de
 * l'Activite Discord). Club analogique, mobile d'abord :
 *   - un vrai libelle et un champ en 16 px (iOS zoome sous 16 px au focus) ;
 *   - le lien est reconnu pendant la saisie (lib/musicLink : memes formes que
 *     le serveur) et Importer ne s'active que pour un lien reconnu ;
 *   - l'import se raconte en clair, le texte reste en encre (regle du brief).
 */
type ImportState = "idle" | "loading" | "syncing" | "done"

type ProfileImportBlockProps = {
  accent?: string
  onImportingChange?: (importing: boolean) => void
  /** Appele quand un import vient d'aboutir (pour rafraichir la bibliotheque). */
  onImported?: () => void
  initialUrl?: string
  /** Lance l'import automatiquement au montage si initialUrl est fournie
      (cas du wizard : l'URL collee doit etre consommee, pas perdue). */
  autoStart?: boolean
  /** Masque le titre interne ("Importe ta musique") quand l'ecran parent a deja son propre titre. */
  hideHeader?: boolean
}

const PROVIDER_NAME = { spotify: "Spotify", deezer: "Deezer" } as const

function recognitionText(r: MusicLinkRecognition): { text: string; tone: "ok" | "warn" } | null {
  if (r.kind === "ok") {
    const name = PROVIDER_NAME[r.provider]
    return r.type === "playlist"
      ? { text: `Playlist ${name}`, tone: "ok" }
      : { text: `Profil ${name} : toutes ses playlists publiques`, tone: "ok" }
  }
  if (r.kind === "short") {
    return { text: "Lien court de l'appli : ouvre-le dans ton navigateur, puis copie l'adresse de la playlist qui s'affiche.", tone: "warn" }
  }
  if (r.kind === "unknown") {
    return { text: "Ce n'est pas un lien de playlist ni de profil Spotify ou Deezer.", tone: "warn" }
  }
  return null
}

const HELP_LINK =
  "inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2e2014] bg-[#f4ecdb] px-3 py-1.5 text-[13px] font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"

export function ProfileImportBlock({ accent = "#c65133", onImportingChange, onImported, initialUrl, autoStart, hideHeader }: ProfileImportBlockProps) {
  const inputId = useId()
  const hintId = useId()
  const [url, setUrl] = useState(initialUrl ?? "")
  const [state, setState] = useState<ImportState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [syncedCount, setSyncedCount] = useState(0)
  const [playlistCount, setPlaylistCount] = useState(0)

  const recognition = recognizeMusicLink(url)
  const hint = recognitionText(recognition)
  const busy = state === "loading" || state === "syncing"

  const updateState = (s: ImportState) => {
    setState(s)
    onImportingChange?.(s === "loading" || s === "syncing")
  }

  const runImport = async (raw: string) => {
    const found = recognizeMusicLink(raw)
    // Le lien normalise (https, sans /intl-xx/) quand on le reconnait ; sinon tel quel, le serveur tranchera.
    const target = found.kind === "ok" ? found.url : raw.trim()
    if (!target) return

    updateState("loading")
    setError(null)

    try {
      const result = await api.importPlaylists(target)
      if (result.playlists.length === 0) {
        setError("Aucune playlist publique trouvée. Vérifie qu'elle est publique, ou essaie un autre lien.")
        updateState("idle")
        return
      }

      setPlaylistCount(result.playlists.length)
      updateState("syncing")

      const ids = result.playlists.map(p => p.id)
      // Quick import: 10 tracks per playlist (enough for a game)
      const syncResult = await api.importSyncAll(result.provider, ids, 10, result.linkId)
      setSyncedCount(syncResult.synced)
      updateState("done")
      if (syncResult.synced > 0) onImported?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'import.")
      updateState("idle")
    }
  }

  const handleImportAll = async (e: React.FormEvent) => {
    e.preventDefault()
    if (recognition.kind !== "ok" || busy) return
    await runImport(url)
  }

  const autoStarted = useRef(false)
  useEffect(() => {
    if (!autoStart || !initialUrl?.trim() || autoStarted.current) return
    autoStarted.current = true
    void runImport(initialUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, initialUrl])

  const reset = () => {
    setState("idle")
    setUrl("")
    setSyncedCount(0)
    setPlaylistCount(0)
    setError(null)
  }

  if (state === "done") {
    const nothing = syncedCount === 0
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] p-3">
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-[#2e2014]"
            style={{ background: nothing ? "#d88418" : accent }}
          >
            <Check className="h-4 w-4 text-[#f4ecdb]" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[15px] font-bold text-[#2e2014]">
              {nothing ? "Aucun titre jouable dans ce lien" : `${syncedCount} titre${syncedCount > 1 ? "s" : ""} importé${syncedCount > 1 ? "s" : ""}`}
            </p>
            <p className="m-0 mt-0.5 text-[13px] text-[#2e2014]">
              {nothing
                ? "Essaie une playlist avec des extraits disponibles (Deezer marche bien)."
                : `Depuis ${playlistCount} playlist${playlistCount > 1 ? "s" : ""}, gardé${syncedCount > 1 ? "s" : ""} dans ta bibliothèque.`}
            </p>
          </div>
        </div>
        <button type="button" onClick={reset} className="text-[13px] font-bold text-[#2e2014] underline underline-offset-4">
          {nothing ? "Essayer un autre lien" : "Importer un autre lien"}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!hideHeader && (
        <div>
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-[#2e2014]">Importe ta musique</p>
          <p className="m-0 mt-1 text-[13px] text-[#2e2014]">Une playlist, ou ton profil pour toutes tes playlists publiques.</p>
        </div>
      )}
      <form onSubmit={handleImportAll} className="space-y-2">
        <label htmlFor={inputId} className="block text-[13px] font-bold text-[#2e2014]">
          Lien d&apos;une playlist ou d&apos;un profil
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            value={url}
            onChange={e => {
              setUrl(e.target.value)
              setError(null)
            }}
            placeholder="https://open.spotify.com/playlist/…"
            disabled={busy}
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-describedby={hint || error ? hintId : undefined}
            aria-invalid={recognition.kind === "unknown" || recognition.kind === "short" || Boolean(error)}
            className="min-w-0 flex-1 rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] px-3.5 py-3 text-base text-[#2e2014] outline-none placeholder:text-[#8a7558] focus:shadow-[3px_3px_0_#2e2014] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || recognition.kind !== "ok"}
            className="flex items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#2e2014] px-5 py-3 text-[15px] font-bold text-[#f4ecdb] transition enabled:hover:bg-[#3d2b1b] disabled:cursor-not-allowed disabled:border-[rgba(46,32,20,.35)] disabled:bg-transparent disabled:text-[rgba(46,32,20,.5)]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? "Import…" : "Importer"}
          </button>
        </div>
        <div id={hintId} className="min-h-[1.25rem]">
          {busy ? (
            <p className="m-0 flex items-center gap-2 text-[13px] font-semibold text-[#2e2014]" role="status">
              {state === "loading" ? "On cherche les playlists…" : `Import de ${playlistCount} playlist${playlistCount > 1 ? "s" : ""}…`}
            </p>
          ) : error ? (
            <p className="m-0 text-[13px] font-bold text-[#9c2f1d]" role="alert">{error}</p>
          ) : hint ? (
            <p className={`m-0 flex items-center gap-2 text-[13px] ${hint.tone === "ok" ? "font-bold text-[#2e2014]" : "font-semibold text-[#9c2f1d]"}`}>
              {hint.tone === "ok" ? (
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-[#2e2014]" style={{ background: accent }} />
              ) : null}
              {hint.text}
            </p>
          ) : null}
        </div>
      </form>
      <details className="group rounded-md border-[1.5px] border-dashed border-[rgba(46,32,20,.45)] px-3 py-2">
        <summary className="cursor-pointer list-none text-[13px] font-bold text-[#2e2014] [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="mr-1.5 inline-block transition group-open:rotate-90">›</span>
          Où trouver ton lien ?
        </summary>
        {/* L'appli Deezer ne partage qu'un lien court (link.deezer.com), que le
            serveur ne suit pas : on passe par le site, ou on ouvre le lien court. */}
        <ul className="m-0 mt-2 list-none space-y-1.5 p-0 text-[13px] leading-snug text-[#2e2014]">
          <li><strong>Spotify</strong> : sur la playlist, « Partager » puis « Copier le lien ».</li>
          <li><strong>Deezer</strong> : copie l&apos;adresse de la playlist sur deezer.com. Depuis l&apos;appli, ouvre d&apos;abord le lien partagé dans ton navigateur.</li>
          <li>La playlist doit être publique.</li>
        </ul>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <a
            href="https://open.spotify.com/collection/playlists"
            onClick={event => followExternalLink(event, "https://open.spotify.com/collection/playlists")}
            target="_blank"
            rel="noopener noreferrer"
            className={HELP_LINK}
          >
            Ouvrir Spotify <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          <a
            href="https://www.deezer.com/"
            onClick={event => followExternalLink(event, "https://www.deezer.com/")}
            target="_blank"
            rel="noopener noreferrer"
            className={HELP_LINK}
          >
            Ouvrir Deezer <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      </details>
    </div>
  )
}
