"use client"
import { useState } from "react"
import { motion } from "framer-motion"
import Navbar from "@/components/Navbar"
import LayoutGradient from "@/components/LayoutGradient"
import { api } from "@/lib/api"

export default function SettingsPage() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle")

  const runImport = async () => {
    setBusy(true)
    setStatus("idle")
    try {
      await api.importAllTracks()
      setStatus("ok")
    } catch {
      setStatus("err")
    } finally {
      setBusy(false)
    }
  }

  return (
    <LayoutGradient>
      <Navbar />
      <main className="flex flex-col items-center px-6 pt-24 pb-16">
        <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl bg-white/80 rounded-2xl border-2 border-purple-200 shadow p-8">
          <h1 className="text-4xl font-bold text-center mb-3 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Paramètres Spotify
          </h1>
          <p className="text-gray-600 text-center mb-8">L’import complet est optionnel. Le jeu peut démarrer sans.</p>

          <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-100 text-center">
            <div className="text-5xl mb-4">🎧</div>
            <h2 className="text-2xl font-semibold mb-2">Importer mes titres likés</h2>
            <p className="text-gray-700 mb-6">Précharge toute ta bibliothèque pour accélérer les parties.</p>

            <button
              onClick={runImport}
              disabled={busy}
              className={`px-8 py-3 rounded-xl text-lg font-semibold text-white ${
                busy ? "bg-purple-400 cursor-not-allowed" : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              }`}
            >
              {busy ? "Importation…" : "Importer tous mes titres"}
            </button>

            {status === "ok" && <p className="mt-4 text-green-600 font-medium">Importation réussie.</p>}
            {status === "err" && <p className="mt-4 text-red-600 font-medium">Erreur d’importation.</p>}
          </div>
        </motion.div>
      </main>
    </LayoutGradient>
  )
}
