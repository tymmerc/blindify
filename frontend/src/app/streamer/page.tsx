"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ModeGate } from "@/components/system/ModeGate"

const ACCENT = "#f97316"

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

export default function StreamerEntryPage() {
  const router = useRouter()

  return (
    <ModeGate allowedModes={["streamer"]}>
      <div className="min-h-screen px-6 py-10 text-[#f8f0ff]">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.4em]" style={{ color: ACCENT, textShadow: "0 0 8px rgba(249,115,22,0.7)" }}>
                [ Streamer Mode ]
              </p>
              <h1 className="font-display text-4xl md:text-5xl uppercase tracking-[0.04em] leading-tight" style={{ color: ACCENT, textShadow: "0 0 14px rgba(249,115,22,0.6)" }}>
                Joue en live avec ton chat
              </h1>
              <p className="text-sm text-[#9b7fb8]">
                3 modes de jeu : chat avec ta musique, toi avec leur musique, ou les deux ensemble.
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
              borderColor: "rgba(249,115,22,0.4)",
              boxShadow: "0 0 24px rgba(249,115,22,0.2), inset 0 0 14px rgba(249,115,22,0.07)",
            }}
          >
            <CornerFrame color={ACCENT} />
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f7ff]">
                [ Go live ]
              </p>
              <h2 className="font-display text-2xl uppercase tracking-[0.04em] text-[#f8f0ff]">
                Demarrer une session streamer
              </h2>
              <p className="text-sm text-[#9b7fb8]">
                Choisis ton format de jeu et demarre le stream avec ton chat.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/multiplayer?mode=streamer&intent=host")}
              className="w-full justify-center inline-flex items-center gap-2 rounded-[10px] border px-6 py-3 font-display text-sm uppercase tracking-[0.05em] transition-all"
              style={{
                color: ACCENT,
                borderColor: ACCENT,
                background: "rgba(249, 115, 22, 0.08)",
                boxShadow: "0 0 14px rgba(249, 115, 22, 0.45), inset 0 0 10px rgba(249, 115, 22, 0.2)",
                textShadow: "0 0 8px rgba(249, 115, 22, 0.7)",
              }}
            >
              Creer une session streamer
            </button>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b7fb8]">
              Tu choisis le format de jeu dans le lobby avant de demarrer.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { title: "Chat avec ta musique", label: "Mode 1", color: "#ff2ec8", desc: "Le chat joue avec tes musiques. Parfait pour tester la culture musicale de ton audience avec ta playlist." },
              { title: "Toi avec leur musique", label: "Mode 2", color: "#00f7ff", desc: "Tu joues avec les musiques du chat. Decouvre leurs gouts musicaux et montre que tu connais mieux qu'eux." },
              { title: "Vous deux ensemble", label: "Mode 3", color: "#ffea00", desc: "Les deux jouent avec un mix des deux playlists. Le mode ultime pour une competition equitable." },
            ].map(card => (
              <div
                key={card.label}
                className="relative h-full space-y-3 rounded-2xl border bg-[rgba(15,5,30,0.6)] backdrop-blur-[16px] p-6 transition-all hover:-translate-y-1"
                style={{
                  borderColor: `${card.color}55`,
                  boxShadow: `0 0 14px ${card.color}1a, inset 0 0 8px ${card.color}0d`,
                }}
              >
                <CornerFrame color={card.color} />
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg uppercase tracking-[0.03em] text-[#f8f0ff]">{card.title}</h3>
                  <span
                    className="rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em]"
                    style={{
                      background: `${card.color}14`,
                      borderColor: `${card.color}66`,
                      color: card.color,
                    }}
                  >
                    {card.label}
                  </span>
                </div>
                <p className="text-sm text-[#9b7fb8]">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModeGate>
  )
}
