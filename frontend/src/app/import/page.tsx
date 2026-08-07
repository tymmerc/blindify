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
    <div className="min-h-screen text-[#2e2014]">
      <div className="ma-container pb-16 pt-10">
        <div className="flex flex-col gap-6 border-b border-[var(--ma-border)] pb-10 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <Link
              href="/modes"
              className="inline-flex w-fit items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
            >
              &larr; Retour
            </Link>
            <div className="space-y-1">
              <h1 className="font-display text-3xl font-semibold sm:text-4xl">Importe ta <em className="font-medium italic text-[#c65133]">musique</em></h1>
              <p className="text-[15px] text-[#6b573f]">Colle ton lien Spotify ou Deezer pour récupérer tes titres.</p>
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <SurfaceCard className="space-y-4">
            <div className="space-y-2">
              <h2 className="font-display text-xl font-semibold">Lien de profil ou de playlist</h2>
              <p className="text-sm text-[#6b573f]">
                Supporte Spotify et Deezer. Seules les playlists <strong>publiques</strong> sont visibles.
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://open.spotify.com/user/... ou https://deezer.com/profile/..."
                className="flex-1 rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-4 py-3 text-sm text-[#2e2014] placeholder:italic placeholder:text-[#b3a182] outline-none transition focus:border-[#c65133]"
              />
              <Button
                type="submit"
                variant="default"
                disabled={loading || !url.trim()}
                className="px-6 py-3 text-sm"
              >
                {loading ? "Recherche..." : "Chercher"}
              </Button>
            </form>

            <div className="flex flex-wrap gap-3 text-xs text-[#8a7558]">
              <span className="rounded-full border border-[rgba(46,32,20,.3)] px-3 py-1">open.spotify.com/user/ton_id</span>
              <span className="rounded-full border border-[rgba(46,32,20,.3)] px-3 py-1">deezer.com/profile/ton_id</span>
              <span className="rounded-full border border-[rgba(46,32,20,.3)] px-3 py-1">open.spotify.com/playlist/...</span>
              <span className="rounded-full border border-[rgba(46,32,20,.3)] px-3 py-1">deezer.com/playlist/...</span>
            </div>
          </SurfaceCard>

          {/* ─── Tutoriels : ou trouver le lien ─── */}
          <SurfaceCard className="space-y-4">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-semibold">Où trouver ton lien</h2>
              <p className="text-sm text-[#6b573f]">Deux minutes, sur ordi ou sur téléphone. Ton profil (ou tes playlists) doit être <strong>public</strong>.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Spotify */}
              <div className="rounded-md border-[1.5px] border-[rgba(46,32,20,.25)] bg-[#efe5d0] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full border-[1.5px] border-[#2e2014] bg-[#7d9471] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f4ecdb]">Spotify</span>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8a7558]">Sur ordinateur</p>
                <ol className="mb-3 ml-4 list-decimal space-y-1 text-sm text-[#2e2014]">
                  <li>Ouvre ton profil ou une playlist.</li>
                  <li>Clic sur les <strong>···</strong> → <strong>Partager</strong> → <strong>Copier le lien</strong>.</li>
                  <li>Colle-le dans le champ ci-dessus.</li>
                </ol>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8a7558]">Sur téléphone</p>
                <ol className="ml-4 list-decimal space-y-1 text-sm text-[#2e2014]">
                  <li>Ouvre le profil/la playlist dans l'app.</li>
                  <li>Touche <strong>···</strong> (en haut à droite) → <strong>Partager</strong> → <strong>Copier le lien</strong>.</li>
                </ol>
              </div>

              {/* Deezer */}
              <div className="rounded-md border-[1.5px] border-[rgba(46,32,20,.25)] bg-[#efe5d0] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full border-[1.5px] border-[#2e2014] bg-[#c65133] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f4ecdb]">Deezer</span>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8a7558]">Sur ordinateur</p>
                <ol className="mb-3 ml-4 list-decimal space-y-1 text-sm text-[#2e2014]">
                  <li>Ouvre ton profil ou une playlist.</li>
                  <li>Clic sur les <strong>···</strong> → <strong>Partager</strong> → <strong>Copier le lien</strong>.</li>
                  <li>Colle-le dans le champ ci-dessus.</li>
                </ol>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8a7558]">Sur téléphone</p>
                <ol className="ml-4 list-decimal space-y-1 text-sm text-[#2e2014]">
                  <li>Ouvre dans l'app Deezer.</li>
                  <li>Touche <strong>···</strong> → <strong>Partager</strong> → <strong>Copier le lien</strong>.</li>
                </ol>
              </div>
            </div>

            <p className="text-xs italic text-[#8a7558]">
              Astuce : un lien de <strong>profil</strong> récupère toutes tes playlists publiques d'un coup. Un lien de <strong>playlist</strong> n'en prend qu'une.
            </p>
          </SurfaceCard>

          {error && (
            <div className="rounded-md border-[1.5px] border-[#9c2f1d] bg-[rgba(156,47,29,.08)] px-4 py-3 text-sm font-bold text-[#9c2f1d]">
              {error}
            </div>
          )}

          {notice && playlists.length > 0 && (
            <div className="rounded-md border-[1.5px] border-[#e0a32e] bg-[rgba(224,163,46,.12)] px-4 py-3 text-sm font-bold text-[#8a6a14]">
              {notice}
            </div>
          )}

          {playlists.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-2xl font-semibold">
                  {playlists.length} playlist{playlists.length > 1 ? "s" : ""} trouv{playlists.length > 1 ? "ées" : "ée"}
                </h2>
                {provider && (
                  <span className={`rounded-full border-[1.5px] border-[#2e2014] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f4ecdb] ${
                    provider === "spotify"
                      ? "bg-[#7d9471]"
                      : "bg-[#c65133]"
                  }`}>
                    {provider}
                  </span>
                )}
              </div>

              {/* Import all banner */}
              {syncAllResult ? (
                <div className="flex items-center gap-4 rounded-md border-[1.5px] border-[#7d9471] bg-[rgba(125,148,113,.14)] px-5 py-4">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#4f6a45]">
                      {syncAllResult.synced} titre{syncAllResult.synced > 1 ? "s" : ""} importé{syncAllResult.synced > 1 ? "s" : ""} depuis {playlists.length} playlist{playlists.length > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-[#8a7558]">Le jeu piochera au hasard dans tous ces titres.</p>
                  </div>
                  <Button
                    variant="default"
                    onClick={() => router.push("/solo?source=library&count=10")}
                    className="px-4 py-2 text-sm"
                  >
                    Jouer
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#2e2014]">
                      Importer toutes les playlists ({totalTracks} titre(s))
                    </p>
                    <p className="text-xs text-[#8a7558]">Le jeu piochera au hasard dans l'ensemble de ta musique.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleSyncAll}
                      disabled={!!syncing}
                      className="px-4 py-2 text-sm"
                    >
                      {syncing === "__all__" ? "Import..." : "Tout importer"}
                    </Button>
                    <Button
                      variant="default"
                      onClick={handleSyncAllAndPlay}
                      disabled={!!syncing}
                      className="px-4 py-2 text-sm"
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
                      className="group relative flex flex-col overflow-hidden rounded-md border-[1.5px] border-[rgba(46,32,20,.22)] bg-[#ece1c8] shadow-[4px_4px_0_rgba(46,32,20,.12)] transition hover:border-[#c65133]"
                    >
                      <div className="relative aspect-[2/1] w-full overflow-hidden border-b-[1.5px] border-[rgba(46,32,20,.22)] bg-[#efe5d0]">
                        {playlist.cover ? (
                          <img
                            src={playlist.cover}
                            alt={playlist.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center font-display text-4xl text-[rgba(46,32,20,.25)]">
                            {provider === "spotify" ? "S" : "D"}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-between p-4">
                        <div className="space-y-1">
                          <h3 className="font-display text-base font-semibold leading-tight">{playlist.name}</h3>
                          <p className="text-xs text-[#8a7558]">{playlist.trackCount} titre{playlist.trackCount > 1 ? "s" : ""}</p>
                        </div>
                        <div className="mt-3 flex gap-2">
                          {isSynced ? (
                            <div className="flex w-full items-center justify-center gap-2 rounded-md border-[1.5px] border-[#7d9471] bg-[rgba(125,148,113,.14)] px-3 py-2 text-xs font-bold text-[#4f6a45]">
                              {syncResult.synced} titres importés
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              onClick={() => handleSync(playlist)}
                              disabled={!!syncing}
                              className="w-full px-3 py-2 text-xs"
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
              <p className="text-sm text-[#6b573f]">
                Colle le lien de ton profil Spotify ou Deezer ci-dessus pour voir tes playlists publiques.
              </p>
            </SurfaceCard>
          )}
        </div>
      </div>
    </div>
  )
}
