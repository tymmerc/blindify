"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ModeGate } from "@/components/system/ModeGate"
import { useMode } from "@/contexts/ModeContext"

export default function ChatEntryPage() {
  const router = useRouter()
  const { accentColor } = useMode()

  return (
    <ModeGate allowedModes={["chat"]}>
      <div className="min-h-screen bg-[#050505] px-6 py-10 text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.35em]" style={{ color: accentColor }}>
                Mode chat
              </p>
              <h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em]">Participation live avec ta commu</h1>
              <p className="text-sm text-white/70">Un flux continu : tu ouvres le salon, le chat répond sans attendre.</p>
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
              <p className="text-xs uppercase tracking-[0.28em] text-white/60">Ouvrir le salon</p>
              <h2 className="text-2xl font-semibold text-white">Lancer la partie pour le chat</h2>
              <p className="text-sm text-white/65">Aucune file, aucune attente : les réponses arrivent en continu.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/multiplayer?mode=chat&autojoin=1")}
              className="w-full justify-center rounded-xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/15"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              Ouvrir le salon live
            </Button>
            <p className="text-xs text-white/60">Tu gardes la main sur le rythme, le changement de mode reste accessible.</p>
          </SurfaceCard>

          <div className="grid gap-4 md:grid-cols-2">
            <SurfaceCard className="h-full space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Comment ça se passe</h3>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em]" style={{ color: accentColor, borderColor: accentColor }}>
                  Flux
                </span>
              </div>
              <ul className="space-y-2 text-sm text-white/80">
                <li>Tu ouvres le salon, le chat rejoint instantanément.</li>
                <li>La musique tourne, chacun peut répondre à la volée.</li>
                <li>Le flux reste ouvert pour accueillir de nouveaux participants.</li>
              </ul>
            </SurfaceCard>

            <SurfaceCard className="h-full space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Ce que tu gagnes ici</h3>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em]" style={{ color: accentColor, borderColor: accentColor }}>
                  Participation
                </span>
              </div>
              <ul className="space-y-2 text-sm text-white/80">
                <li>Participation massive : la quantité de réponses fait l’ambiance.</li>
                <li>Meilleure réponse mise en avant pour rythmer la diffusion.</li>
                <li>Un salon qui reste vivant tant que tu laisses tourner.</li>
              </ul>
            </SurfaceCard>
          </div>
        </div>
      </div>
    </ModeGate>
  )
}
