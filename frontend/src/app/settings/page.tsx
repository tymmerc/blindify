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
      <main className="flex flex-col items-center px-6 pt-32 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-2xl"
        >
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="text-6xl mb-4"
            >
              ⚙️
            </motion.div>
            <h1 className="text-5xl font-bold mb-3 text-gradient">
              Paramètres Spotify
            </h1>
            <p className="text-gray-400 text-lg">
              Personnalise ton expérience de jeu
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-strong rounded-3xl p-8 mb-6"
          >
            <div className="flex items-start gap-6 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-4xl flex-shrink-0">
                🎧
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-semibold text-white mb-2">
                  Importer mes titres likés
                </h2>
                <p className="text-gray-400 leading-relaxed">
                  Précharge toute ta bibliothèque Spotify pour des parties plus rapides et personnalisées. 
                  Cette opération peut prendre quelques minutes.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <motion.button
                whileHover={{ scale: busy ? 1 : 1.02 }}
                whileTap={{ scale: busy ? 1 : 0.98 }}
                onClick={runImport}
                disabled={busy}
                className={`w-full px-8 py-4 rounded-2xl text-lg font-semibold text-white transition-all duration-300 ${
                  busy
                    ? "bg-gray-700 cursor-not-allowed opacity-50"
                    : "bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 hover-lift"
                }`}
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Importation en cours…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <span>📥</span>
                    Importer tous mes titres
                  </span>
                )}
              </motion.button>

              {status === "ok" && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl p-4 border border-green-500/30"
                >
                  <div className="flex items-center gap-3 text-green-400">
                    <span className="text-2xl">✓</span>
                    <div>
                      <p className="font-semibold">Importation réussie</p>
                      <p className="text-sm text-gray-400">Tes titres sont maintenant disponibles</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {status === "err" && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl p-4 border border-red-500/30"
                >
                  <div className="flex items-center gap-3 text-red-400">
                    <span className="text-2xl">✗</span>
                    <div>
                      <p className="font-semibold">Erreur d'importation</p>
                      <p className="text-sm text-gray-400">Vérifie ta connexion et réessaie</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="glass rounded-2xl p-6"
          >
            <h3 className="text-lg font-semibold text-white mb-3">💡 Le savais-tu ?</h3>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 mt-0.5">•</span>
                <span>L'import est optionnel - tu peux jouer sans importer</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5">•</span>
                <span>Plus tu as de titres, plus les parties sont variées</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-400 mt-0.5">•</span>
                <span>Tes données restent privées et sécurisées</span>
              </li>
            </ul>
          </motion.div>
        </motion.div>
      </main>
    </LayoutGradient>
  )
}