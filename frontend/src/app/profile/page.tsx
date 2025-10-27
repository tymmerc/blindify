"use client"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import Navbar from "@/components/Navbar"
import LayoutGradient from "@/components/LayoutGradient"
import { api } from "@/lib/api"

interface Badge {
  name: string
  description: string
  icon: string
  tier: string
  earned_at: string
}

interface Stats {
  completed_games: number
  solo_games: number
  multiplayer_games: number
  avg_correct_answers: number
  avg_response_time: number
  discovered_tracks: number
  badges_earned: number
  best_game_score: number
}

interface UserData {
  username: string
  level: number
  xp: number
  totalScore: number
  gamesPlayed: number
  currentStreak: number
  bestStreak: number
}

interface GameHistory {
  id: number
  mode: string
  difficulty: string
  source: string
  total_questions: number
  correct_answers: number
  final_score: number
  avg_response_time: number
  streak_achieved: number
  xp_earned: number
  started_at: string
  completed_at: string
}

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [badges, setBadges] = useState<Badge[]>([])
  const [history, setHistory] = useState<GameHistory[]>([])

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const authCheck = await api.checkAuth()
        if (!authCheck) {
          router.push("/menu")
          return
        }

        const profileData = await api.getProfile()
        if (profileData) {
          setUser(profileData.user)
          setStats(profileData.stats)
          setBadges(profileData.badges || [])
        }

        const historyData = await api.getHistory()
        setHistory(historyData.history || [])
      } catch (err) {
        console.error("Failed to load profile:", err)
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
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
            <p className="text-xl text-gray-400">Chargement du profil…</p>
          </motion.div>
        </div>
      </LayoutGradient>
    )
  }

  if (!user) {
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xl text-gray-400">Profil introuvable</p>
        </div>
      </LayoutGradient>
    )
  }

  const xpForNextLevel = user.level * 100
  const xpProgress = (user.xp / xpForNextLevel) * 100

  return (
    <LayoutGradient>
      <Navbar />
      <main className="flex-1 px-4 pt-32 pb-12 max-w-7xl mx-auto w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong rounded-3xl p-8 mb-8"
        >
          <div className="flex items-center gap-6 mb-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-4xl font-bold text-white">
              {user.username?.charAt(0).toUpperCase() || "?"}
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-gradient mb-2">{user.username}</h1>
              <div className="flex items-center gap-4">
                <span className="glass px-4 py-2 rounded-lg text-lg font-semibold">
                  Niveau {user.level}
                </span>
                <span className="text-gray-400">
                  {user.xp} / {xpForNextLevel} XP
                </span>
              </div>
            </div>
          </div>

          {/* XP Bar */}
          <div className="w-full h-4 glass rounded-full overflow-hidden mb-4">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${xpProgress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-gradient mb-1">{user.totalScore}</div>
              <div className="text-sm text-gray-400">Points totaux</div>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-gradient mb-1">{user.gamesPlayed}</div>
              <div className="text-sm text-gray-400">Parties jouées</div>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-orange-400 mb-1">🔥 {user.bestStreak}</div>
              <div className="text-sm text-gray-400">Meilleure série</div>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-gradient mb-1">{badges.length}</div>
              <div className="text-sm text-gray-400">Badges</div>
            </div>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Detailed Stats */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-strong rounded-2xl p-6"
          >
            <h2 className="text-2xl font-bold text-white mb-6">📊 Statistiques détaillées</h2>
            {stats && (
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-gray-400">Parties complétées</span>
                  <span className="text-white font-semibold">{stats.completed_games}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-gray-400">Parties solo</span>
                  <span className="text-white font-semibold">{stats.solo_games}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-gray-400">Parties multi</span>
                  <span className="text-white font-semibold">{stats.multiplayer_games}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-gray-400">Moyenne réponses correctes</span>
                  <span className="text-white font-semibold">
                    {stats.avg_correct_answers ? Math.round(stats.avg_correct_answers) : 0}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-gray-400">Temps de réponse moyen</span>
                  <span className="text-white font-semibold">
                    {stats.avg_response_time ? `${Math.round(stats.avg_response_time / 1000)}s` : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-gray-400">Morceaux découverts</span>
                  <span className="text-white font-semibold">{stats.discovered_tracks}</span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-gray-400">Meilleur score</span>
                  <span className="text-gradient font-bold text-xl">{stats.best_game_score || 0}</span>
                </div>
              </div>
            )}
          </motion.div>

          {/* Badges */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-strong rounded-2xl p-6"
          >
            <h2 className="text-2xl font-bold text-white mb-6">🏆 Badges débloqués</h2>
            {badges.length > 0 ? (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {badges.map((badge, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * i }}
                    className={`glass rounded-xl p-4 flex items-center gap-4 ${
                      badge.tier === "gold"
                        ? "border-2 border-yellow-500/50"
                        : badge.tier === "silver"
                        ? "border-2 border-gray-400/50"
                        : "border border-white/10"
                    }`}
                  >
                    <div className="text-4xl">{badge.icon}</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-white">{badge.name}</h3>
                      <p className="text-sm text-gray-400">{badge.description}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Débloqué le {new Date(badge.earned_at).toLocaleDateString()}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">
                Aucun badge débloqué pour le moment. Continue de jouer !
              </p>
            )}
          </motion.div>
        </div>

        {/* History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-strong rounded-2xl p-6"
        >
          <h2 className="text-2xl font-bold text-white mb-6">📜 Historique des parties</h2>
          {history.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {history.map((game, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="glass rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {game.mode === "solo" ? "🎧" : "👥"}
                      </span>
                      <div>
                        <p className="font-semibold text-white">
                          {game.mode === "solo" ? "Solo" : "Multijoueur"} - {game.difficulty}
                        </p>
                        <p className="text-sm text-gray-400">
                          {new Date(game.completed_at).toLocaleDateString()} à{" "}
                          {new Date(game.completed_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gradient">{game.final_score} pts</div>
                      <div className="text-sm text-gray-400">
                        {game.correct_answers}/{game.total_questions}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="glass px-3 py-1 rounded-lg">
                      🔥 Série: {game.streak_achieved}
                    </span>
                    <span className="glass px-3 py-1 rounded-lg">
                      ⭐ XP: +{game.xp_earned}
                    </span>
                    <span className="glass px-3 py-1 rounded-lg">
                      ⏱️ Moy: {Math.round(game.avg_response_time / 1000)}s
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">
              Aucune partie terminée. Lance ton premier blind test !
            </p>
          )}
        </motion.div>

        {/* Back Button */}
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