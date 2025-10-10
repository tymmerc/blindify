"use client"
import { useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import Navbar from "@/components/Navbar"
import { api } from "@/lib/api"
import { PageTransition } from "@/lib/page-transition"

export default function SettingsPage() {
  const [isImporting, setIsImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle")

  const handleImport = async () => {
    setIsImporting(true)

    try {
      await api.importAllTracks()

      setImportStatus("success")
    } catch (error) {
      console.error("[v0] Import error:", error)
      setImportStatus("error")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <PageTransition>
      <main className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100 dark:from-purple-950 dark:via-pink-950 dark:to-purple-900 transition-colors duration-300">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-0 w-1/3 h-full bg-gradient-to-br from-purple-500 to-pink-500 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-1/3 h-full bg-gradient-to-tl from-pink-500 to-purple-500 blur-3xl" />
        </div>

        <Navbar />

        <div className="flex-1 flex flex-col items-center justify-center px-4 py-32 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-2xl"
          >
            <Link
              href="/menu"
              className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-6 font-semibold"
            >
              ← Retour au menu
            </Link>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200 shadow-xl p-8">
              <div className="mb-6">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                  Paramètres
                </h1>
                <p className="text-lg text-gray-600">Gère ta bibliothèque musicale</p>
              </div>

              <div className="space-y-6">
                <div className="flex items-start gap-4 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-100">
                  <svg
                    className="w-8 h-8 text-purple-600 flex-shrink-0 mt-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-2">Importer mes titres likés</h3>
                    <p className="text-gray-600 mb-4">
                      Importe tous tes titres likés depuis Spotify pour jouer avec ta propre musique
                    </p>

                    {isImporting && (
                      <div className="mb-4">
                        <div className="flex justify-between text-sm text-gray-600 mb-2">
                          <span>Importation en cours...</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleImport}
                      disabled={isImporting}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-semibold px-6 py-3 rounded-xl text-lg transition-all duration-300 flex items-center gap-2"
                    >
                      <svg
                        className={`w-5 h-5 ${isImporting ? "animate-bounce" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      {isImporting ? "Importation en cours..." : "Importer tous mes titres"}
                    </button>

                    {importStatus === "success" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 flex items-center gap-2 text-green-600 font-medium"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Importation réussie&nbsp;!
                      </motion.div>
                    )}

                    {importStatus === "error" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 flex items-center gap-2 text-red-600 font-medium"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Erreur lors de l&apos;importation. Vérifie ta connexion Spotify.
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </PageTransition>
  )
}
