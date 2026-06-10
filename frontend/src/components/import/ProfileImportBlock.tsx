"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"

type ImportState = "idle" | "loading" | "syncing" | "done"

type ProfileImportBlockProps = {
  accent?: string
  onImportingChange?: (importing: boolean) => void
  initialUrl?: string
}

export function ProfileImportBlock({ accent = "#a855f7", onImportingChange, initialUrl }: ProfileImportBlockProps) {
  const [url, setUrl] = useState(initialUrl ?? "")
  const [state, setState] = useState<ImportState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [syncedCount, setSyncedCount] = useState(0)
  const [playlistCount, setPlaylistCount] = useState(0)

  const updateState = (s: ImportState) => {
    setState(s)
    onImportingChange?.(s === "loading" || s === "syncing")
  }

  const handleImportAll = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
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

  if (state === "done") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: accent }}>
          <span>{syncedCount} titre{syncedCount > 1 ? "s" : ""} importe{syncedCount > 1 ? "s" : ""}</span>
        </div>
        <p className="text-[10px] text-white/40">
          depuis {playlistCount} playlist{playlistCount > 1 ? "s" : ""}
        </p>
        <button
          onClick={() => { setState("idle"); setUrl(""); setSyncedCount(0); setPlaylistCount(0) }}
          className="text-xs text-white/50 underline hover:text-white/70"
        >
          Importer un autre profil
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.2em] text-white/50">Importe ta musique</p>
      <p className="text-xs text-white/60">Colle ton lien de profil Spotify ou Deezer.</p>
      <form onSubmit={handleImportAll} className="flex gap-2">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://open.spotify.com/user/..."
          disabled={state !== "idle"}
          className="flex-1 rounded-lg border border-white/15 bg-[#0f0f0f] px-3 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/30 disabled:opacity-50"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={state !== "idle" || !url.trim()}
          className="rounded-lg border-white/15 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50"
          style={{ borderColor: `${accent}66`, color: accent }}
        >
          {state === "loading" ? "..." : state === "syncing" ? `${playlistCount} pl...` : "Go"}
        </Button>
      </form>
      <p className="text-[10px] text-white/35">
        {state === "syncing"
          ? "Import de toutes les playlists en cours..."
          : "Toutes les playlists publiques seront importees."}
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
