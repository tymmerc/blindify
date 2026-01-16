"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ModeGate } from "@/components/system/ModeGate"
import { useMode } from "@/contexts/ModeContext"

export default function StreamerEntryPage() {
  const router = useRouter()
  const { accentColor } = useMode()

  return (
    <ModeGate allowedModes={["streamer"]}>
      <div className="min-h-screen bg-[#050505] px-6 py-10 text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.35em]" style={{ color: accentColor }}>
                Mode Streamer
              </p>
              <h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em]">Joue en live avec ton chat</h1>
              <p className="text-sm text-white/70">3 modes de jeu : chat avec ta musique, toi avec leur musique, ou les deux ensemble.</p>
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
              <p className="text-xs uppercase tracking-[0.28em] text-white/60">Lancer le stream</p>
              <h2 className="text-2xl font-semibold text-white">Démarrer une session streamer</h2>
              <p className="text-sm text-white/65">Choisis ton format de jeu et démarre le stream avec ton chat.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/multiplayer?mode=streamer&intent=host")}
              className="w-full justify-center rounded-xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/15"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              Créer une session streamer
            </Button>
            <p className="text-xs text-white/60">Tu choisis le format de jeu dans le lobby avant de démarrer.</p>
          </SurfaceCard>

          <div className="grid gap-4 md:grid-cols-3">
            <SurfaceCard className="h-full space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Chat avec ta musique</h3>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em]" style={{ color: accentColor, borderColor: accentColor }}>
                  Mode 1
                </span>
              </div>
              <p className="text-sm text-white/80">
                Le chat joue avec tes musiques. Parfait pour tester la culture musicale de ton audience avec ta playlist.
              </p>
            </SurfaceCard>

            <SurfaceCard className="h-full space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Toi avec leur musique</h3>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em]" style={{ color: accentColor, borderColor: accentColor }}>
                  Mode 2
                </span>
              </div>
              <p className="text-sm text-white/80">
                Tu joues avec les musiques du chat. Découvre leurs goûts musicaux et montre que tu connais mieux qu'eux.
              </p>
            </SurfaceCard>

            <SurfaceCard className="h-full space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Vous deux ensemble</h3>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em]" style={{ color: accentColor, borderColor: accentColor }}>
                  Mode 3
                </span>
              </div>
              <p className="text-sm text-white/80">
                Les deux jouent avec un mix des deux playlists. Le mode ultime pour une compétition équitable.
              </p>
            </SurfaceCard>
          </div>
        </div>
      </div>
    </ModeGate>
  )
}
