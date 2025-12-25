"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { useMode } from "@/contexts/ModeContext"
import { FriendsGameModal } from "@/components/modals/FriendsGameModal"

export default function EventEntryPage() {
  const router = useRouter()
  const { accentColor, setMode, mode } = useMode()
  const [chooserOpen, setChooserOpen] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [joinError, setJoinError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (mode !== "event") {
      setMode("event")
    }
  }, [mode, setMode])

  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    setJoinError(null)
    setMode("event")
    await router.push("/multiplayer?mode=event&intent=host")
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
    setMode("event")
    await router.push(`/multiplayer?mode=event&code=${encodeURIComponent(code)}`)
    setChooserOpen(false)
    setJoining(false)
  }

  return (
    <>
      <div className="min-h-screen bg-[#050505] px-6 py-10 text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.35em]" style={{ color: accentColor }}>
                Mode événement
              </p>
              <h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em]">Projection collective maîtrisée</h1>
              <p className="text-sm text-white/70">Un écran principal, un tempo clair, tout le monde suit sans se perdre.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/modes")}
              className="rounded-full border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
            >
              Retour menu
            </Button>
          </div>

          <SurfaceCard className="flex flex-col gap-4 rounded-2xl border-white/10 bg-[#0c0c0c] p-7">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.28em] text-white/60">Prendre la main</p>
              <h2 className="text-2xl font-semibold text-white">Démarrer l’événement maintenant</h2>
              <p className="text-sm text-white/65">Lisible à distance, cadence stable, un seul hôte garde le rythme.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setChooserOpen(true)}
              className="w-full justify-center rounded-xl border-2 px-5 py-3 text-sm font-semibold transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
              style={{ borderColor: accentColor, color: accentColor, backgroundColor: "transparent" }}
            >
              Lancer l’écran principal
            </Button>
            <p className="text-xs text-white/60">Les participants rejoignent via l’écran, tu peux changer de mode quand tu veux.</p>
          </SurfaceCard>

          <div className="grid gap-4 md:grid-cols-2">
            <SurfaceCard className="h-full space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Comment ça se passe</h3>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em]" style={{ color: accentColor, borderColor: accentColor }}>
                  Tempo
                </span>
              </div>
              <ul className="space-y-2 text-sm text-white/80">
                <li>Un seul écran pilote, tout le monde suit la projection.</li>
                <li>Les joueurs répondent sur leur téléphone, sans friction.</li>
                <li>Le host contrôle le rythme et les lancers de manches.</li>
              </ul>
            </SurfaceCard>

            <SurfaceCard className="h-full space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Objectif du mode</h3>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em]" style={{ color: accentColor, borderColor: accentColor }}>
                  Collectif
                </span>
              </div>
              <ul className="space-y-2 text-sm text-white/80">
                <li>Mettre le groupe au même rythme avec un affichage lisible.</li>
                <li>Projeter un score total qui motive toute la salle.</li>
                <li>Garder une cadence stable pour enchaîner les titres.</li>
              </ul>
            </SurfaceCard>
          </div>
        </div>
      </div>

      <FriendsGameModal
        open={chooserOpen}
        onClose={() => {
          if (creating || joining) return
          setChooserOpen(false)
        }}
        accentColor={accentColor}
        joinCode={joinCode}
        setJoinCode={setJoinCode}
        joinError={joinError}
        creating={creating}
        joining={joining}
        onCreate={handleCreate}
        onJoin={handleJoin}
      />
    </>
  )
}
