"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useMode } from "@/contexts/ModeContext"
import { FriendsGameModal } from "@/components/modals/FriendsGameModal"
import { api } from "@/lib/api"

const ACCENT = "#a855f7"

function CornerFrame({ color }: { color: string }) {
  return (
    <>
      <span aria-hidden className="absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute right-2 top-2 h-3 w-3 border-r-2 border-t-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2" style={{ borderColor: color }} />
      <span aria-hidden className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2" style={{ borderColor: color }} />
    </>
  )
}

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
      <div className="min-h-screen px-6 py-10 text-[#f8f0ff]">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#a855f7] text-glow">
                [ Event Mode ]
              </p>
              <h1 className="font-display text-4xl md:text-5xl uppercase tracking-[0.04em] leading-tight" style={{ color: ACCENT, textShadow: "0 0 12px rgba(168,85,247,0.7)" }}>
                Projection collective
              </h1>
              <p className="text-sm text-[#9b7fb8]">
                Un ecran principal, un tempo clair, tout le monde suit sans se perdre.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/modes")}
              className="rounded-sm border-[#00f7ff]/30 bg-[rgba(15,5,30,0.6)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00f7ff] hover:bg-[#00f7ff]/10 hover:border-[#00f7ff]/60 hover:shadow-glow-cyan"
            >
              Retour menu
            </Button>
          </div>

          <div
            className="relative flex flex-col gap-4 rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-7"
            style={{
              borderColor: "rgba(168,85,247,0.4)",
              boxShadow: "0 0 24px rgba(168,85,247,0.18), inset 0 0 14px rgba(168,85,247,0.06)",
            }}
          >
            <CornerFrame color={ACCENT} />
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">
                [ Host control ]
              </p>
              <h2 className="font-display text-2xl uppercase tracking-[0.04em] text-[#f8f0ff]">
                Demarrer l&apos;evenement maintenant
              </h2>
              <p className="text-sm text-[#9b7fb8]">
                Lisible a distance, cadence stable, un seul hote garde le rythme.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChooserOpen(true)}
              className="btn-neon-pink font-display w-full justify-center text-sm"
              style={{
                color: ACCENT,
                borderColor: ACCENT,
                background: "rgba(168, 85, 247, 0.06)",
                boxShadow: "0 0 14px rgba(168, 85, 247, 0.45), inset 0 0 10px rgba(168, 85, 247, 0.2)",
                textShadow: "0 0 8px rgba(168, 85, 247, 0.7)",
              }}
            >
              Lancer l&apos;ecran principal
            </button>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]">
              Les participants rejoignent via l&apos;ecran, tu peux changer de mode quand tu veux.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div
              className="relative h-full space-y-3 rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6"
              style={{
                borderColor: "rgba(168,85,247,0.3)",
                boxShadow: "0 0 16px rgba(168,85,247,0.1), inset 0 0 8px rgba(168,85,247,0.04)",
              }}
            >
              <CornerFrame color={ACCENT} />
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg uppercase tracking-[0.03em] text-[#f8f0ff]">Tempo</h3>
                <span className="rounded-sm border border-[#a855f7]/50 bg-[#a855f7]/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a855f7]">
                  Cadence
                </span>
              </div>
              <ul className="space-y-2 text-sm text-[#9b7fb8]">
                <li>Un seul ecran pilote, tout le monde suit la projection.</li>
                <li>Les joueurs repondent sur leur telephone, sans friction.</li>
                <li>Le host controle le rythme et les lancers de manches.</li>
              </ul>
            </div>

            <div
              className="relative h-full space-y-3 rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6"
              style={{
                borderColor: "rgba(0,247,255,0.3)",
                boxShadow: "0 0 16px rgba(0,247,255,0.1), inset 0 0 8px rgba(0,247,255,0.04)",
              }}
            >
              <CornerFrame color="#00f7ff" />
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg uppercase tracking-[0.03em] text-[#f8f0ff]">Collectif</h3>
                <span className="rounded-sm border border-[#00f7ff]/50 bg-[#00f7ff]/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00f7ff]">
                  Groupe
                </span>
              </div>
              <ul className="space-y-2 text-sm text-[#9b7fb8]">
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
