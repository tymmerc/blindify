"use client"

import { useRouter } from "next/navigation"
import { ModeGate } from "@/components/system/ModeGate"
import { useMode } from "@/contexts/ModeContext"

export default function FriendsEntryPage() {
  const router = useRouter()
  const { accentColor } = useMode()

  return (
    <ModeGate allowedModes={["friends"]}>
      <div className="min-h-screen bg-[#050505] px-6 py-10 text-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">Mode Amis</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Jouer avec des amis</h1>
            <p className="mt-2 text-sm text-white/70">Invite tes potes, on lance la musique, vous répondez.</p>
            <button
              type="button"
              onClick={() => router.push("/multiplayer?mode=friends&intent=host")}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold transition-colors"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              Créer ou rejoindre une salle privée
            </button>
          </div>

          <div
            className="rounded-2xl border p-5"
            style={{ borderColor: accentColor, backgroundColor: "rgba(236,72,153,0.22)" }}
          >
            <h3 className="text-lg font-semibold text-white">Comment ça se passe</h3>
            <p className="mt-2 text-sm text-white/80">Une partie simple, rapide, entre personnes que tu connais.</p>
            <ul className="mt-3 space-y-2 text-sm text-white/85 list-disc list-inside">
              <li>Tu invites tes amis ou tu rejoins leur salle</li>
              <li>Une musique démarre, chacun répond de son côté</li>
              <li>Les scores s’affichent, et ça chambre un peu</li>
            </ul>
          </div>
        </div>
      </div>
    </ModeGate>
  )
}
