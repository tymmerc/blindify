"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"

type ImportState = "idle" | "loading" | "syncing" | "done"

type ProfileImportBlockProps = {
  accent?: string
  onImportingChange?: (importing: boolean) => void
  initialUrl?: string
  /** Lance l'import automatiquement au montage si initialUrl est fournie
      (cas du wizard : l'URL collee doit etre consommee, pas perdue). */
  autoStart?: boolean
  /** Masque le titre interne ("Importe ta musique") quand l'ecran parent a deja son propre titre. */
  hideHeader?: boolean
}

export function ProfileImportBlock({ accent = "#c65133", onImportingChange, initialUrl, autoStart, hideHeader }: ProfileImportBlockProps) {
  const [url, setUrl] = useState(initialUrl ?? "")
  const [state, setState] = useState<ImportState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [syncedCount, setSyncedCount] = useState(0)
  const [playlistCount, setPlaylistCount] = useState(0)

  const updateState = (s: ImportState) => {
    setState(s)
    onImportingChange?.(s === "loading" || s === "syncing")
  }

  const runImport = async (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return

    updateState("loading")
    setError(null)

    try {
      const result = await api.importPlaylists(trimmed)
      if (result.playlists.length === 0) {
        setError("Aucune playlist publique trouvée.")
        updateState("idle")
        return
      }

      setPlaylistCount(result.playlists.length)
      updateState("syncing")

      const ids = result.playlists.map(p => p.id)
      // Quick import: 10 tracks per playlist (enough for a game)
      const syncResult = await api.importSyncAll(result.provider, ids, 10)
      setSyncedCount(syncResult.synced)
      updateState("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'import.")
      updateState("idle")
    }
  }

  const handleImportAll = async (e: React.FormEvent) => {
    e.preventDefault()
    await runImport(url)
  }

  const autoStarted = useRef(false)
  useEffect(() => {
    if (!autoStart || !initialUrl?.trim() || autoStarted.current) return
    autoStarted.current = true
    void runImport(initialUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, initialUrl])

  if (state === "done") {
    const nothing = syncedCount === 0
    return (
      <div className="space-y-2">
        {nothing ? (
          <div className="flex items-center gap-2 text-sm font-semibold text-[#9c2f1d]">
            <span>Aucun titre jouable trouvé dans ce profil.</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: accent }}>
            <span>{syncedCount} titre{syncedCount > 1 ? "s" : ""} importé{syncedCount > 1 ? "s" : ""}</span>
          </div>
        )}
        <p className="text-[10px] text-[#8a7558]">
          {nothing
            ? "Essaie une playlist avec des extraits disponibles (Deezer marche bien)."
            : `depuis ${playlistCount} playlist${playlistCount > 1 ? "s" : ""}`}
        </p>
        <button
          onClick={() => { setState("idle"); setUrl(""); setSyncedCount(0); setPlaylistCount(0) }}
          className="text-xs text-[#6b573f] underline hover:text-[#2e2014]"
        >
          {nothing ? "Réessayer avec un autre profil" : "Importer un autre profil"}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {!hideHeader && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Importe ta musique</p>
          <p className="text-xs text-[#6b573f]">Colle ton lien de profil Spotify ou Deezer.</p>
        </>
      )}
      <form onSubmit={handleImportAll} className="flex gap-2">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://open.spotify.com/user/..."
          disabled={state !== "idle"}
          className="flex-1 rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-3 py-2 text-xs text-[#2e2014] outline-none placeholder:italic placeholder:text-[#b3a182] focus:border-[#c65133] disabled:opacity-50"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={state !== "idle" || !url.trim()}
          className="px-3 py-2 text-xs"
          style={{ borderColor: accent, color: accent }}
        >
          {state === "loading" ? "..." : state === "syncing" ? `${playlistCount} pl...` : "Go"}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#8a7558]">
        <span>Besoin de ton lien&nbsp;?</span>
        <a
          href="https://open.spotify.com/collection/playlists"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-2.5 py-1 font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
        >
          Ouvrir Spotify <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href="https://www.deezer.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-2.5 py-1 font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
        >
          Ouvrir Deezer <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <p className="text-[10px] text-[#8a7558]">
        {state === "syncing"
          ? "Import de toutes les playlists en cours..."
          : "Toutes les playlists publiques seront importées."}
      </p>
      {error && <p className="text-xs font-bold text-[#9c2f1d]">{error}</p>}
    </div>
  )
}
