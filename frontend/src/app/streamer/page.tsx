"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ModeGate } from "@/components/system/ModeGate"

const ACCENT = "#7d9471"

export default function StreamerEntryPage() {
  const router = useRouter()

  return (
    <ModeGate allowedModes={["streamer"]}>
      <div className="min-h-screen px-6 py-10 text-[#2e2014]">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.32em]" style={{ color: ACCENT }}>
                Streamer · Mode
              </p>
              <h1 className="font-display text-4xl font-semibold leading-tight md:text-5xl">
                Joue en live avec ton <em className="font-medium italic" style={{ color: ACCENT }}>chat</em>
              </h1>
              <p className="text-sm text-[#6b573f]">
                3 modes de jeu : chat avec ta musique, toi avec leur musique, ou les deux ensemble.
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
                Go live
              </p>
              <h2 className="font-display text-2xl font-semibold text-[#2e2014]">
                Demarrer une session streamer
              </h2>
              <p className="text-sm text-[#6b573f]">
                Choisis ton format de jeu et demarre le stream avec ton chat.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/multiplayer?mode=streamer&intent=host")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] px-6 py-3 font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
              style={{ background: ACCENT }}
            >
              Creer une session streamer
            </button>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">
              Tu choisis le format de jeu dans le lobby avant de demarrer.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { title: "Chat avec ta musique", label: "Mode 1", color: "#c65133", desc: "Le chat joue avec tes musiques. Parfait pour tester la culture musicale de ton audience avec ta playlist." },
              { title: "Toi avec leur musique", label: "Mode 2", color: "#e0a32e", desc: "Tu joues avec les musiques du chat. Decouvre leurs gouts musicaux et montre que tu connais mieux qu'eux." },
              { title: "Vous deux ensemble", label: "Mode 3", color: "#7d9471", desc: "Les deux jouent avec un mix des deux playlists. Le mode ultime pour une competition equitable." },
            ].map(card => (
              <div
                key={card.label}
                className="relative h-full space-y-3 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)] transition-transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-[#2e2014]">{card.title}</h3>
                  <span
                    className="rounded-full border-[1.5px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f4ecdb]"
                    style={{ background: card.color, borderColor: card.color }}
                  >
                    {card.label}
                  </span>
                </div>
                <p className="text-sm text-[#6b573f]">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModeGate>
  )
}
