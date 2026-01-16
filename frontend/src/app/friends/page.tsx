"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { useMode } from "@/contexts/ModeContext"
import { FriendsGameModal } from "@/components/modals/FriendsGameModal"

export default function FriendsEntryPage() {
  const router = useRouter()
  const { accentColor, setMode, mode } = useMode()
  const [joinCode, setJoinCode] = useState("")
  const [chooserOpen, setChooserOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== "friends") {
      setMode("friends")
    }
  }, [mode, setMode])

  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    setJoinError(null)
    setMode("friends")
    await router.push("/multiplayer?mode=friends&intent=host")
    setChooserOpen(false)
    setCreating(false)
  }

  const handleJoin = async () => {
    if (joining) return
    const code = joinCode.trim().toUpperCase()
    if (!code) {
      setJoinError("Entre un code valide.")
      return
    }
    setJoinError(null)
    setJoining(true)
    setMode("friends")
    await router.push(`/multiplayer?mode=friends&code=${encodeURIComponent(code)}`)
    setChooserOpen(false)
    setJoining(false)
  }

  return (
    <>
      <div className="min-h-screen bg-[#050505] px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.35em]" style={{ color: accentColor }}>
                MODE AMIS
              </p>
              <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.04em]">Des blind tests à partir de vos propres musiques</h1>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/modes")}
              className="rounded-full border-white/15 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white/80 hover:bg-white/10 hover:text-white"
            >
              Retour au menu
            </Button>
          </div>

          <SurfaceCard className="flex flex-col gap-4 rounded-2xl border-white/10 bg-[#0c0c0c] p-7">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-white">Jouer avec des amis</h2>
              <p className="text-sm text-white/70">Invite tes proches et lance une partie sans friction : une seule action, le reste dans le pop-up.</p>
            </div>

            <div className="space-y-3">
              <Button
                variant="outline"
                onClick={() => setChooserOpen(true)}
                className="w-full justify-center rounded-xl border-2 px-5 py-3 text-sm font-semibold transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
                style={{ borderColor: accentColor, color: accentColor, backgroundColor: "transparent" }}
              >
                Créer ou rejoindre une partie
              </Button>
            </div>
          </SurfaceCard>

          <div className="flex flex-col gap-6">
            <SurfaceCard className="h-full space-y-3 text-left">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Comment ça se passe ?</h3>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em]" style={{ color: accentColor, borderColor: accentColor }}>
                  Gameplay
                </span>
              </div>
              <ul className="space-y-2 text-sm text-white/80 leading-relaxed list-disc list-inside">
                <li>Chaque partie se construit à partir de ce que vous écoutez</li>
                <li>Une musique démarre, chacun réponds de son coté</li>
                <li>Tu compares vos goûts musicaux et qui a la plus grande culture musicale !</li>
              </ul>
            </SurfaceCard>
          </div>
        </div>
      </div>
      {chooserOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-6">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0b0b] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Tu veux créer ou rejoindre ?</h3>
              <button
                type="button"
                onClick={() => setChooserOpen(false)}
                className="text-sm text-white/60 hover:text-white"
              >
                Fermer
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <button
                type="button"
                onClick={handleCreate}
                className="w-full rounded-xl border border-white/15 bg-[#101010] px-5 py-3 text-left text-sm font-semibold text-white transition hover:border-white/30 hover:bg-[#141414]"
                style={{ borderColor: accentColor, color: accentColor }}
              >
                Créer une salle privée
                <span className="mt-1 block text-xs font-normal text-white/60">Deviens hôte.</span>
              </button>
              <div className="space-y-2 rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
                <label className="text-xs uppercase tracking-[0.25em] text-white/60">Rejoindre avec un code</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="CODE"
                    className="w-full rounded-lg border border-white/15 bg-[#0c0c0c] px-3 py-2 text-sm uppercase tracking-[0.25em] text-white outline-none focus:border-white/30"
                  />
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={!joinCode.trim()}
                    className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
                    style={{ borderColor: accentColor, color: accentColor }}
                  >
                    Rejoindre
                  </button>
                </div>
                {joinError ? <p className="text-xs text-red-300">{joinError}</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
