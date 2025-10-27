"use client"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import Navbar from "@/components/Navbar"
import LayoutGradient from "@/components/LayoutGradient"
import { api } from "@/lib/api"

interface LeaderboardEntry {
  id: number
  username: string
  total_score: number
  games_played: number
  level: number
  best_streak: number
  avg_score_per_game: number
  badges_count: number
}

export default function LeaderboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: number; username: string } | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const authCheck = await api.checkAuth()
        if (!authCheck) {
          router.push("/menu")
          return
        }

        setCurrentUser(authCheck.user)

        const data = await api.getLeaderboard()
        setLeaderboard(data.leaderboard || [])
      } catch (err) {
        console.error("Failed to load leaderboard:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [router])

  if (loading) {
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xl text-gray-400">Chargement du classement…</p>
          </motion.div>
        </div>
      </LayoutGradient>
    )
  }

  const getMedalEmoji = (rank: number) => {
    if (rank === 1) return "🥇"
    if (rank === 2) return "🥈"
    if (rank === 3) return "🥉"
    return `#${rank}`
  }

  return (
    <LayoutGradient>
      <Navbar />
      <main className="flex-1 px-4 pt-32 pb-12 max-w-6xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-6xl font-bold text-gradient mb-4">🏆 Classement Global</h1>
          <p className="text-xl text-gray-400">Les meilleurs joueurs de Blindify</p>
        </motion.div>

        {leaderboard.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-strong rounded-2xl p-6"
          >
            <div className="space-y-3">
              {leaderboard.map((entry, index) => {
                const isCurrentUser = currentUser && entry.id === currentUser.id
                const rank = index + 1

                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * index }}
                    className={`rounded-xl p-5 flex items-center gap-4 transition-all duration-300 ${
                      isCurrentUser
                        ? "bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border-2 border-indigo-500"
                        : rank <= 3
                        ? "bg-gradient-to-r from-yellow-500/10 to-orange-500/10 glass"
                        : "glass hover:glass-strong"
                    }`}
                  >
                    {/* Rank */}
                    <div className="w-16 h-16 flex-shrink-0 rounded-full glass flex items-center justify-center">
                      <span className="text-2xl font-bold">
                        {getMedalEmoji(rank)}
                      </span>
                    </div>

                    {/* Username */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-white truncate">
                        {entry.username}
                        {isCurrentUser && (
                          <span className="ml-2 text-sm text-indigo-400">(Toi)</span>
                        )}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                        <span>Niveau {entry.level}</span>
                        <span>•</span>
                        <span>{entry.games_played} parties</span>
                        {entry.badges_count > 0 && (
                          <>
                            <span>•</span>
                            <span>🏆 {entry.badges_count} badges</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="hidden md:flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-sm text-gray-400">Total</div>
                        <div className="text-xl font-bold text-gradient">
                          {entry.total_score.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-gray-400">Moyenne</div>
                        <div className="text-xl font-bold text-white">
                          {Math.round(entry.avg_score_per_game)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-gray-400">Série</div>
                        <div className="text-xl font-bold text-orange-400">
                          🔥 {entry.best_streak}
                        </div>
                      </div>
                    </div>

                    {/* Mobile Stats */}
                    <div className="md:hidden text-right">
                      <div className="text-2xl font-bold text-gradient">
                        {entry.total_score.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-400">points</div>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {leaderboard.length >= 50 && (
              <p className="text-center text-gray-500 mt-6 text-sm">
                Top 50 des meilleurs joueurs
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-strong rounded-2xl p-12 text-center"
          >
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Le classement est vide
            </h2>
            <p className="text-gray-400 mb-6">
              Sois le premier à jouer et à apparaître dans le classement !
            </p>
            <button
              onClick={() => router.push("/game")}
              className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-semibold px-8 py-3 rounded-xl transition-all duration-300 hover-lift"
            >
              Commencer à jouer
            </button>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center"
        >
          <button
            onClick={() => router.push("/menu")}
            className="glass hover:glass-strong px-8 py-3 rounded-xl font-semibold text-gray-300 hover:text-white transition-all duration-300 hover-lift"
          >
            ← Retour au menu
          </button>
        </motion.div>
      </main>
    </LayoutGradient>
  )
}