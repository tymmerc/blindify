"use client"

import { useRouter } from "next/navigation"
import { ModeGate } from "@/components/system/ModeGate"
import { useMode } from "@/contexts/ModeContext"

export default function EventEntryPage() {
  const router = useRouter()
  const { accentColor } = useMode()

  return (
    <ModeGate allowedModes={["event"]}>
      <div className="min-h-screen bg-[#050505] px-6 py-10 text-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">Mode Événement</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Jouer en événement</h1>
            <p className="mt-2 text-sm text-white/70">Un écran, un rythme, tout le monde suit.</p>
            <button
              type="button"
              onClick={() => router.push("/multiplayer?mode=event&intent=host")}
              className="group relative mt-5 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full border px-4 py-3 text-sm font-semibold transition-all duration-200"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              <span
                className="absolute inset-0 scale-0 bg-white/5 transition-transform duration-200 ease-out group-hover:scale-100"
                aria-hidden
              />
              <span className="relative">Démarrer un événement</span>
            </button>
            <button
              type="button"
              onClick={() => router.push("/modes")}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 transition-colors hover:border-white/40 hover:text-white"
            >
              Changer de mode
            </button>
          </div>

          <div
            className="rounded-2xl border p-5"
            style={{ borderColor: accentColor, backgroundColor: "rgba(139,92,246,0.22)" }}
          >
            <h3 className="text-lg font-semibold text-white">Comment ça se passe</h3>
            <p className="mt-2 text-sm text-white/80">Tout le monde regarde le même écran, tu mènes la partie.</p>
            <ul className="mt-3 space-y-2 text-sm text-white/85 list-disc list-inside">
              <li>Tu lances l’événement</li>
              <li>La musique démarre pour tous en même temps</li>
              <li>Les joueurs répondent sur leur téléphone</li>
            </ul>
          </div>
        </div>
      </div>
    </ModeGate>
  )
}
