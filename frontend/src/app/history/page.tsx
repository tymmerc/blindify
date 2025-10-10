"use client"
import { motion } from "framer-motion"
import Link from "next/link"
import Navbar from "@/components/Navbar"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { PageTransition } from "@/lib/page-transition"

interface Game {
  id: string
  mode: "solo" | "multiplayer"
  score: number
  correctAnswers: number
  totalQuestions: number
  date: string
  duration: number
  players?: string[]
}

export default function HistoryPage() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "solo" | "multiplayer">("all")
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      const data = await api.getHistory()
      setGames(data.games || [])
    } catch (error) {
      console.error("Failed to load history:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredGames = games.filter((game) => {
    if (filter === "all") return true
    return game.mode === filter
  })

  const soloGamesCount = games.filter((g) => g.mode === "solo").length
  const multiGamesCount = games.filter((g) => g.mode === "multiplayer").length

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, "0")}`
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
            className="w-full max-w-4xl"
          >
            <Link
              href="/menu"
              className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-6 font-semibold"
            >
              ← Retour au menu
            </Link>

            <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-8 text-center">
              Historique
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200 shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-3xl">🎮</div>
                  <h3 className="text-xl font-bold text-gray-900">Parties Solo</h3>
                </div>
                <p className="text-4xl font-bold text-gray-900">{soloGamesCount}</p>
                <p className="text-gray-600">parties jouées</p>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-pink-200 shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-3xl">👥</div>
                  <h3 className="text-xl font-bold text-gray-900">Parties Multijoueur</h3>
                </div>
                <p className="text-4xl font-bold text-gray-900">{multiGamesCount}</p>
                <p className="text-gray-600">parties jouées</p>
              </div>
            </div>

            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setFilter("all")}
                className={`px-6 py-2 rounded-xl font-semibold transition-all ${
                  filter === "all"
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg"
                    : "bg-white/80 text-gray-700 hover:bg-white"
                }`}
              >
                Toutes
              </button>
              <button
                onClick={() => setFilter("solo")}
                className={`px-6 py-2 rounded-xl font-semibold transition-all ${
                  filter === "solo"
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg"
                    : "bg-white/80 text-gray-700 hover:bg-white"
                }`}
              >
                Solo
              </button>
              <button
                onClick={() => setFilter("multiplayer")}
                className={`px-6 py-2 rounded-xl font-semibold transition-all ${
                  filter === "multiplayer"
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg"
                    : "bg-white/80 text-gray-700 hover:bg-white"
                }`}
              >
                Multijoueur
              </button>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200 shadow-xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Parties récentes</h2>

              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Chargement...</p>
                </div>
              ) : filteredGames.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📅</div>
                  <p className="text-xl text-gray-600 mb-2">Aucune partie trouvée</p>
                  <p className="text-gray-500">
                    {filter === "all"
                      ? "Lance une partie solo ou multijoueur pour commencer ton historique !"
                      : `Aucune partie ${filter === "solo" ? "solo" : "multijoueur"} jouée pour le moment`}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredGames.map((game) => (
                    <motion.div
                      key={game.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100 hover:border-purple-300 transition-all cursor-pointer"
                      onClick={() => setSelectedGame(game)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">{game.mode === "solo" ? "🎮" : "👥"}</div>
                          <div>
                            <h3 className="font-bold text-gray-900">
                              {game.mode === "solo" ? "Partie Solo" : "Partie Multijoueur"}
                            </h3>
                            <p className="text-sm text-gray-600">{formatDate(game.date)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold text-purple-600">{game.score}</p>
                          <p className="text-sm text-gray-600">points</p>
                        </div>
                      </div>
                      <div className="flex gap-6 text-sm text-gray-700">
                        <div>
                          <span className="font-semibold">Bonnes réponses:</span> {game.correctAnswers}/
                          {game.totalQuestions}
                        </div>
                        <div>
                          <span className="font-semibold">Durée:</span> {formatDuration(game.duration)}
                        </div>
                        {game.players && game.players.length > 0 && (
                          <div>
                            <span className="font-semibold">Joueurs:</span> {game.players.length}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {selectedGame && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedGame(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl p-8 max-w-2xl w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-gray-900">Détails de la partie</h2>
                <button onClick={() => setSelectedGame(null)} className="text-gray-500 hover:text-gray-700 text-2xl">
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 text-xl">
                  <div className="text-3xl">{selectedGame.mode === "solo" ? "🎮" : "👥"}</div>
                  <span className="font-semibold">
                    {selectedGame.mode === "solo" ? "Partie Solo" : "Partie Multijoueur"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-purple-50 rounded-xl p-4">
                    <p className="text-sm text-gray-600 mb-1">Score final</p>
                    <p className="text-3xl font-bold text-purple-600">{selectedGame.score}</p>
                  </div>
                  <div className="bg-pink-50 rounded-xl p-4">
                    <p className="text-sm text-gray-600 mb-1">Précision</p>
                    <p className="text-3xl font-bold text-pink-600">
                      {Math.round((selectedGame.correctAnswers / selectedGame.totalQuestions) * 100)}%
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Date:</span>
                    <span className="font-semibold">{formatDate(selectedGame.date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Bonnes réponses:</span>
                    <span className="font-semibold">
                      {selectedGame.correctAnswers}/{selectedGame.totalQuestions}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Durée:</span>
                    <span className="font-semibold">{formatDuration(selectedGame.duration)}</span>
                  </div>
                  {selectedGame.players && selectedGame.players.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Joueurs:</span>
                      <span className="font-semibold">{selectedGame.players.join(", ")}</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedGame(null)}
                className="w-full mt-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg transition-all"
              >
                Fermer
              </button>
            </motion.div>
          </motion.div>
        )}
      </main>
    </PageTransition>
  )
}
