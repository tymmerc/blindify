"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useMode } from "@/contexts/ModeContext"
import { FriendsGameModal } from "@/components/modals/FriendsGameModal"
import { api } from "@/lib/api"

const ACCENT = "#e0a32e"

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
      <div className="min-h-screen px-6 py-10 text-[#2e2014]">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#a87714]">
                Event · Mode
              </p>
              <h1 className="font-display text-4xl font-semibold leading-tight md:text-5xl">
                Projection <em className="font-medium italic text-[#a87714]">collective</em>
              </h1>
              <p className="text-sm text-[#6b573f]">
                Un ecran principal, un tempo clair, tout le monde suit sans se perdre.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/modes")}
              className="rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
            >
              Retour menu
            </Button>
          </div>

          <div className="relative flex flex-col gap-4 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-7 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
                Host control
              </p>
              <h2 className="font-display text-2xl font-semibold text-[#2e2014]">
                Demarrer l&apos;evenement maintenant
              </h2>
              <p className="text-sm text-[#6b573f]">
                Lisible a distance, cadence stable, un seul hote garde le rythme.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChooserOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] px-6 py-3 font-bold text-[#2e2014] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
              style={{ background: ACCENT }}
            >
              Lancer l&apos;ecran principal
            </button>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
              Les participants rejoignent via l&apos;ecran, tu peux changer de mode quand tu veux.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="relative h-full space-y-3 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-[#2e2014]">Tempo</h3>
                <span
                  className="rounded-full border-[1.5px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]"
                  style={{ background: ACCENT, borderColor: ACCENT }}
                >
                  Cadence
                </span>
              </div>
              <ul className="space-y-2 text-sm text-[#6b573f]">
                <li>Un seul ecran pilote, tout le monde suit la projection.</li>
                <li>Les joueurs repondent sur leur telephone, sans friction.</li>
                <li>Le host controle le rythme et les lancers de manches.</li>
              </ul>
            </div>

            <div className="relative h-full space-y-3 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-[#2e2014]">Collectif</h3>
                <span className="rounded-full border-[1.5px] border-[#a8b8c8] bg-[#a8b8c8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014]">
                  Groupe
                </span>
              </div>
              <ul className="space-y-2 text-sm text-[#6b573f]">
                <li>Mettre le groupe au meme rythme avec un affichage lisible.</li>
                <li>Projeter un score total qui motive toute la salle.</li>
                <li>Garder une cadence stable pour enchainer les titres.</li>
              </ul>
            </div>
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
