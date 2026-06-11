"use client"

import { useEffect, useRef, useState } from "react"
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
}

export function ProfileImportBlock({ accent = "#c65133", onImportingChange, initialUrl, autoStart }: ProfileImportBlockProps) {
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
        setError("Aucune playlist publique trouvee.")
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
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: accent }}>
          <span>{syncedCount} titre{syncedCount > 1 ? "s" : ""} importe{syncedCount > 1 ? "s" : ""}</span>
        </div>
        <p className="text-[10px] text-[#8a7558]">
          depuis {playlistCount} playlist{playlistCount > 1 ? "s" : ""}
        </p>
        <button
          onClick={() => { setState("idle"); setUrl(""); setSyncedCount(0); setPlaylistCount(0) }}
          className="text-xs text-[#6b573f] underline hover:text-[#2e2014]"
        >
          Importer un autre profil
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Importe ta musique</p>
      <p className="text-xs text-[#6b573f]">Colle ton lien de profil Spotify ou Deezer.</p>
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
      <p className="text-[10px] text-[#8a7558]">
        {state === "syncing"
          ? "Import de toutes les playlists en cours..."
          : "Toutes les playlists publiques seront importees."}
      </p>
      {error && <p className="text-xs font-bold text-[#9c2f1d]">{error}</p>}
    </div>
  )
}
