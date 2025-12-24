"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { ModeGate } from "@/components/system/ModeGate"
import { useMode } from "@/contexts/ModeContext"

export default function ChatEntryPage() {
  const router = useRouter()
  const { accentColor } = useMode()

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/multiplayer?mode=chat&autojoin=1")
    }, 300)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <ModeGate allowedModes={["chat"]}>
      <div className="min-h-screen bg-[#050505] px-6 py-10 text-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">Mode Chat</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Jouer avec le chat</h1>
            <p className="mt-2 text-sm text-white/70">Le chat joue avec toi, au rythme du jeu.</p>
            <p className="mt-4 text-xs text-white/60">Connexion au salon en cours…</p>
          </div>

          <div
            className="rounded-2xl border p-5"
            style={{ borderColor: accentColor, backgroundColor: "rgba(34,211,238,0.22)" }}
          >
            <h3 className="text-lg font-semibold text-white">Comment ça se passe</h3>
            <p className="mt-2 text-sm text-white/80">Le jeu avance, le chat réagit en direct.</p>
            <ul className="mt-3 space-y-2 text-sm text-white/85 list-disc list-inside">
              <li>Tu démarres la partie</li>
              <li>La musique tourne, le chat répond</li>
              <li>Les messages s’affichent au fil du jeu</li>
            </ul>
          </div>
        </div>
      </div>
    </ModeGate>
  )
}
