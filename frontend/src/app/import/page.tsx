"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { Button } from "@/components/ui/button"

type ImportedPlaylist = {
  id: string
  name: string
  trackCount: number
  cover: string | null
}

export default function ImportPage() {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null) // playlistId or "__all__"
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<"spotify" | "deezer" | null>(null)
  const [playlists, setPlaylists] = useState<ImportedPlaylist[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ playlistId: string; synced: number } | null>(null)
  const [syncAllResult, setSyncAllResult] = useState<{ synced: number; total: number } | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    setPlaylists([])
    setProvider(null)
    setNotice(null)
    setSyncResult(null)
    setSyncAllResult(null)

    try {
      const result = await api.importPlaylists(trimmed)
      setProvider(result.provider)
      setPlaylists(result.playlists)
      setNotice(result.notice)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les playlists.")
    } finally {
      setLoading(false)
    }
  }

  const handleSyncAll = async () => {
    if (!provider || syncing) return
    setSyncing("__all__")
    setError(null)
    setSyncResult(null)
    setSyncAllResult(null)

    try {
      const ids = playlists.map(p => p.id)
      const result = await api.importSyncAll(provider, ids)
      setSyncAllResult({ synced: result.synced, total: result.total })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la synchronisation.")
    } finally {
      setSyncing(null)
    }
  }

  const handleSyncAllAndPlay = async () => {
    if (!provider || syncing) return
    setSyncing("__all__")
    setError(null)

    try {
      const ids = playlists.map(p => p.id)
      await api.importSyncAll(provider, ids)
      router.push("/solo?source=library&count=10")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la synchronisation.")
      setSyncing(null)
    }
  }

  const handleSync = async (playlist: ImportedPlaylist) => {
    if (!provider || syncing) return
    setSyncing(playlist.id)
    setError(null)
    setSyncResult(null)

    try {
      const result = await api.importSync(provider, playlist.id)
      setSyncResult({ playlistId: playlist.id, synced: result.synced })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la synchronisation.")
    } finally {
      setSyncing(null)
    }
  }

  const totalTracks = playlists.reduce((s, p) => s + p.trackCount, 0)

  return (
    <div className="min-h-screen bg-[var(--ma-bg)] text-white">
      <div className="ma-container pb-16 pt-10">
        <div className="flex flex-col gap-6 border-b border-[var(--ma-border)] pb-10 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <Link
              href="/modes"
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--ma-border-strong)] px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
            >
              &larr; Retour
            </Link>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Importer ta musique</h1>
              <p className="text-[15px] text-[var(--ma-muted)]">Colle ton lien de profil pour retrouver tes playlists.</p>
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <SurfaceCard className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Lien de profil ou de playlist</h2>
              <p className="text-sm text-white/60">
                Supporte Spotify et Deezer. Seules les playlists <strong>publiques</strong> sont visibles.
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://open.spotify.com/user/... ou https://deezer.com/profile/..."
                className="flex-1 rounded-xl border border-[var(--ma-border-strong)] bg-[#0f0f0f] px-4 py-3 text-sm text-white placeholder:text-[#606060] outline-none transition focus:border-[rgba(168,85,247,0.5)]"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={loading || !url.trim()}
                className="rounded-xl border-purple-500/40 px-6 py-3 text-sm font-semibold text-purple-400 hover:bg-purple-500/10 disabled:opacity-50"
              >
                {loading ? "Recherche..." : "Chercher"}
              </Button>
            </form>

            <div className="flex flex-wrap gap-3 text-xs text-white/40">
              <span className="rounded-full border border-white/10 px-3 py-1">open.spotify.com/user/ton_id</span>
              <span className="rounded-full border border-white/10 px-3 py-1">deezer.com/profile/ton_id</span>
              <span className="rounded-full border border-white/10 px-3 py-1">open.spotify.com/playlist/...</span>
              <span className="rounded-full border border-white/10 px-3 py-1">deezer.com/playlist/...</span>
            </div>
          </SurfaceCard>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {notice && playlists.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              {notice}
            </div>
          )}

          {playlists.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold tracking-[-0.02em]">
                  {playlists.length} playlist{playlists.length > 1 ? "s" : ""} trouv{playlists.length > 1 ? "ees" : "ee"}
                </h2>
                {provider && (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${
                    provider === "spotify"
                      ? "bg-green-500/15 text-green-400"
                      : "bg-purple-500/15 text-purple-400"
                  }`}>
                    {provider}
                  </span>
                )}
              </div>

              {/* Import all banner */}
              {syncAllResult ? (
                <div className="flex items-center gap-4 rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-green-400">
                      {syncAllResult.synced} titre{syncAllResult.synced > 1 ? "s" : ""} importe{syncAllResult.synced > 1 ? "s" : ""} depuis {playlists.length} playlist{playlists.length > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-white/40">Le jeu piochera au hasard dans tous ces titres.</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/solo?source=library&count=10")}
                    className="rounded-lg border-green-500/30 px-4 py-2 text-sm font-semibold text-green-400 hover:bg-green-500/10"
                  >
                    Jouer
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-xl border border-purple-500/20 bg-purple-500/5 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white/80">
                      Importer toutes les playlists ({totalTracks} titres)
                    </p>
                    <p className="text-xs text-white/40">Le jeu piochera au hasard dans l'ensemble de ta musique.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleSyncAll}
                      disabled={!!syncing}
                      className="rounded-lg border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50"
                    >
                      {syncing === "__all__" ? "Import..." : "Tout importer"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSyncAllAndPlay}
                      disabled={!!syncing}
                      className="rounded-lg border-purple-500/30 px-4 py-2 text-sm font-semibold text-purple-400 hover:bg-purple-500/10 disabled:opacity-50"
                    >
                      {syncing === "__all__" ? "..." : "Tout importer & Jouer"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Individual playlists */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {playlists.map(playlist => {
                  const isSynced = syncResult?.playlistId === playlist.id
                  const isSyncing = syncing === playlist.id
                  return (
                    <div
                      key={playlist.id}
                      className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--ma-border)] bg-[var(--ma-surface)] transition hover:border-purple-500/30"
                    >
                      <div className="relative aspect-[2/1] w-full overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                        {playlist.cover ? (
                          <img
                            src={playlist.cover}
                            alt={playlist.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-4xl text-white/20">
                            {provider === "spotify" ? "S" : "D"}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-between p-4">
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold leading-tight">{playlist.name}</h3>
                          <p className="text-xs text-white/50">{playlist.trackCount} titre{playlist.trackCount > 1 ? "s" : ""}</p>
                        </div>
                        <div className="mt-3 flex gap-2">
                          {isSynced ? (
                            <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-500/15 px-3 py-2 text-xs font-semibold text-green-400">
                              {syncResult.synced} titres importes
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              onClick={() => handleSync(playlist)}
                              disabled={!!syncing}
                              className="w-full rounded-lg border-white/15 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50"
                            >
                              {isSyncing ? "Import..." : "Importer cette playlist"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {!loading && playlists.length === 0 && !error && (
            <SurfaceCard className="space-y-3 text-center">
              <p className="text-sm text-white/50">
                Colle le lien de ton profil Spotify ou Deezer ci-dessus pour voir tes playlists publiques.
              </p>
            </SurfaceCard>
          )}
        </div>
      </div>
    </div>
  )
}
