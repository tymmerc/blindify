"use client"
import { motion } from "framer-motion"
import Link from "next/link"
import { useEffect, useState } from "react"
import Navbar from "@/components/Navbar"
import { api } from "@/lib/api"

interface DetailedStats {
  totalGames: number
  totalCorrect: number
  totalQuestions: number
  successRate: number
  currentStreak: number
  bestStreak: number
  averageScore: number
  bestScore: number
  soloGames: number
  multiGames: number
  scoreHistory: Array<{ date: string; score: number }>
  genreStats: Array<{ genre: string; correct: number; total: number }>
  artistStats: Array<{ artist: string; correct: number; total: number }>
}

export default function StatsPage() {
  const [stats, setStats] = useState<DetailedStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<"week" | "month" | "all">("week")

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const data = await api.getDetailedStats()
      setStats(data)
    } catch (error) {
      console.error("Failed to load stats:", error)
    } finally {
      setLoading(false)
    }
  }

  const filterScoreHistory = () => {
    if (!stats) return []
    const now = new Date()
    const filtered = stats.scoreHistory.filter((item) => {
      const date = new Date(item.date)
      if (selectedPeriod === "week") {
        return now.getTime() - date.getTime() <= 7 * 24 * 60 * 60 * 1000
      } else if (selectedPeriod === "month") {
        return now.getTime() - date.getTime() <= 30 * 24 * 60 * 60 * 1000
      }
      return true
    })
    return filtered
  }

  const maxScore = stats ? Math.max(...stats.scoreHistory.map((s) => s.score), 100) : 100

  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100">
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
          className="w-full max-w-6xl"
        >
          <Link
            href="/menu"
            className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-6 font-semibold"
          >
            ← Retour au menu
          </Link>

          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-8 text-center">
            Statistiques Détaillées
          </h1>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent"></div>
              <p className="mt-4 text-gray-600">Chargement des statistiques...</p>
            </div>
          ) : !stats || stats.totalGames === 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200 shadow-xl p-8">
              <div className="text-center py-12">
                <p className="text-xl text-gray-600">Commence à jouer pour voir tes statistiques détaillées !</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200 shadow-lg p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-600">Taux de réussite</h3>
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                      <span className="text-purple-600 text-lg">%</span>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{stats.successRate.toFixed(1)}%</div>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.totalCorrect}/{stats.totalQuestions} bonnes réponses
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-pink-200 shadow-lg p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-600">Série actuelle</h3>
                    <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center">
                      <span className="text-pink-600 text-lg">🔥</span>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{stats.currentStreak}</div>
                  <p className="text-xs text-gray-500 mt-1">Bonnes réponses d&apos;affilée</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200 shadow-lg p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-600">Meilleure série</h3>
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                      <span className="text-purple-600 text-lg">⭐</span>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{stats.bestStreak}</div>
                  <p className="text-xs text-gray-500 mt-1">Record personnel</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-pink-200 shadow-lg p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-600">Parties jouées</h3>
                    <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center">
                      <span className="text-pink-600 text-lg">🎵</span>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{stats.totalGames}</div>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.soloGames} solo, {stats.multiGames} multi
                  </p>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200 shadow-xl p-8 mb-8"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                  <h2 className="text-2xl font-bold text-gray-900">Évolution du score</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedPeriod("week")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        selectedPeriod === "week"
                          ? "bg-purple-600 text-white shadow-lg"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Semaine
                    </button>
                    <button
                      onClick={() => setSelectedPeriod("month")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        selectedPeriod === "month"
                          ? "bg-purple-600 text-white shadow-lg"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Mois
                    </button>
                    <button
                      onClick={() => setSelectedPeriod("all")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        selectedPeriod === "all"
                          ? "bg-purple-600 text-white shadow-lg"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Tout
                    </button>
                  </div>
                </div>

                <div className="relative h-64 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4">
                  <svg className="w-full h-full" viewBox="0 0 800 200" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgb(147, 51, 234)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="rgb(147, 51, 234)" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {filterScoreHistory().length > 0 && (
                      <>
                        <polyline
                          fill="url(#scoreGradient)"
                          stroke="none"
                          points={`0,200 ${filterScoreHistory()
                            .map((item, i) => {
                              const x = (i / (filterScoreHistory().length - 1)) * 800
                              const y = 200 - (item.score / maxScore) * 180
                              return `${x},${y}`
                            })
                            .join(" ")} 800,200`}
                        />
                        <polyline
                          fill="none"
                          stroke="rgb(147, 51, 234)"
                          strokeWidth="3"
                          points={filterScoreHistory()
                            .map((item, i) => {
                              const x = (i / (filterScoreHistory().length - 1)) * 800
                              const y = 200 - (item.score / maxScore) * 180
                              return `${x},${y}`
                            })
                            .join(" ")}
                        />
                        {filterScoreHistory().map((item, i) => {
                          const x = (i / (filterScoreHistory().length - 1)) * 800
                          const y = 200 - (item.score / maxScore) * 180
                          return <circle key={i} cx={x} cy={y} r="4" fill="rgb(147, 51, 234)" />
                        })}
                      </>
                    )}
                  </svg>
                </div>

                <div className="mt-4 flex justify-between text-sm text-gray-600">
                  <span>Score moyen: {stats.averageScore.toFixed(0)}</span>
                  <span>Meilleur score: {stats.bestScore}</span>
                </div>
              </motion.div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200 shadow-xl p-8"
                >
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Statistiques par genre</h2>
                  <div className="space-y-4">
                    {stats.genreStats.slice(0, 5).map((genre, i) => {
                      const percentage = (genre.correct / genre.total) * 100
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="font-medium text-gray-700">{genre.genre}</span>
                            <span className="text-gray-600">
                              {genre.correct}/{genre.total} ({percentage.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ delay: 0.7 + i * 0.1, duration: 0.5 }}
                              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-pink-200 shadow-xl p-8"
                >
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Top artistes</h2>
                  <div className="space-y-4">
                    {stats.artistStats.slice(0, 5).map((artist, i) => {
                      const percentage = (artist.correct / artist.total) * 100
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="font-medium text-gray-700">{artist.artist}</span>
                            <span className="text-gray-600">
                              {artist.correct}/{artist.total} ({percentage.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ delay: 0.8 + i * 0.1, duration: 0.5 }}
                              className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </main>
  )
}
