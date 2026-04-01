"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { useMode } from "@/contexts/ModeContext"
import { FriendsGameModal } from "@/components/modals/FriendsGameModal"
import { api } from "@/lib/api"

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
    try { await api.ensureUserSession("Organisateur") } catch {}
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
    try { await api.ensureUserSession("Participant") } catch {}
    await router.push(`/multiplayer?mode=event&code=${encodeURIComponent(code)}`)
    setChooserOpen(false)
    setJoining(false)
  }

  return (
    <>
      <div className="min-h-screen bg-[#0a0e17] px-6 py-10 text-[#E0E8F0]">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8b5cf6]">
                Mode événement
              </p>
              <h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em] text-[#E0E8F0]">
                Projection collective maîtrisée
              </h1>
              <p className="text-sm text-[#8896b0]">
                Un écran principal, un tempo clair, tout le monde suit sans se perdre.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/modes")}
              className="rounded-xl border-white/[0.08] bg-[rgba(14,18,32,0.45)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[#8896b0] backdrop-blur-[16px] transition hover:border-white/[0.15] hover:text-[#E0E8F0]"
            >
              Retour menu
            </Button>
          </div>

          <SurfaceCard className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[rgba(14,18,32,0.45)] p-7 backdrop-blur-[16px]">
            <div className="space-y-1">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8896b0]">
                Prendre la main
              </p>
              <h2 className="text-2xl font-semibold text-[#E0E8F0]">
                Démarrer l'événement maintenant
              </h2>
              <p className="text-sm text-[#8896b0]">
                Lisible à distance, cadence stable, un seul hôte garde le rythme.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setChooserOpen(true)}
              className="w-full justify-center rounded-xl border bg-[rgba(139,92,246,0.12)] px-5 py-3 text-sm font-semibold text-[#8b5cf6] transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]"
              style={{ borderColor: "rgba(139,92,246,0.25)" }}
            >
              Lancer l'écran principal
            </Button>
            <p className="text-[11px] text-[#8896b0]">
              Les participants rejoignent via l'écran, tu peux changer de mode quand tu veux.
            </p>
          </SurfaceCard>

          <div className="grid gap-4 md:grid-cols-2">
            <SurfaceCard className="h-full space-y-3 rounded-2xl border border-white/[0.08] bg-[rgba(14,18,32,0.45)] p-6 backdrop-blur-[16px]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#E0E8F0]">Comment ça se passe</h3>
                <span className="rounded-full border border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.08)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[#8b5cf6]">
                  Tempo
                </span>
              </div>
              <ul className="space-y-2 text-sm text-[#8896b0]">
                <li>Un seul écran pilote, tout le monde suit la projection.</li>
                <li>Les joueurs répondent sur leur téléphone, sans friction.</li>
                <li>Le host contrôle le rythme et les lancers de manches.</li>
              </ul>
            </SurfaceCard>

            <SurfaceCard className="h-full space-y-3 rounded-2xl border border-white/[0.08] bg-[rgba(14,18,32,0.45)] p-6 backdrop-blur-[16px]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#E0E8F0]">Objectif du mode</h3>
                <span className="rounded-full border border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.08)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[#8b5cf6]">
                  Collectif
                </span>
              </div>
              <ul className="space-y-2 text-sm text-[#8896b0]">
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
