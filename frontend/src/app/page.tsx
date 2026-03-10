"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function HomePage() {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePlay = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)

    try {
      const encoded = encodeURIComponent(trimmed)
      router.push(`/play?url=${encoded}`)
    } catch {
      setError("Erreur inattendue.")
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 text-white">
      <div className="w-full max-w-xl space-y-10 text-center">
        <div className="space-y-3">
          <h1 className="text-5xl font-bold tracking-[-0.04em] sm:text-6xl">
            Blind
            <span className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">ify</span>
          </h1>
          <p className="text-lg text-white/60">
            Colle ton lien Spotify ou Deezer, joue direct.
          </p>
        </div>

        <form onSubmit={handlePlay} className="space-y-4">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://open.spotify.com/user/... ou deezer.com/profile/..."
            className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-base text-white placeholder:text-white/30 outline-none transition focus:border-purple-500/50 focus:bg-white/[0.07]"
          />
          <Button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4 text-base font-bold text-white shadow-[0_12px_40px_rgba(168,85,247,0.3)] transition hover:shadow-[0_16px_48px_rgba(168,85,247,0.4)] hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "Preparation..." : "Jouer"}
          </Button>

          <p className="text-xs text-white/35">
            Seules les playlists <strong className="text-white/50">publiques</strong> sont utilisees. Aucun compte requis.
          </p>
        </form>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Formats acceptes</p>
          <div className="flex flex-wrap justify-center gap-2 text-xs text-white/30">
            <span className="rounded-full border border-white/10 px-3 py-1">open.spotify.com/user/ton_id</span>
            <span className="rounded-full border border-white/10 px-3 py-1">deezer.com/profile/ton_id</span>
            <span className="rounded-full border border-white/10 px-3 py-1">open.spotify.com/playlist/...</span>
            <span className="rounded-full border border-white/10 px-3 py-1">deezer.com/playlist/...</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 pt-4">
          <Link
            href="/modes"
            className="text-sm text-white/50 underline decoration-white/20 underline-offset-4 transition hover:text-white/70"
          >
            Se connecter pour plus de fonctionnalites
          </Link>
        </div>
      </div>
    </div>
  )
}
