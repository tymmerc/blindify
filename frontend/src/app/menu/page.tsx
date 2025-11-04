"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Play, Users, Music, Trophy, History, Settings, User, BarChart3 } from "lucide-react"
import { api } from "@/lib/api"
import type { UserSummary } from "@/lib/types"

export default function MenuPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const me = await api.checkAuth()
        if (!active) return
        if (!me) {
          router.replace("/auth/login")
          return
        }
        setUser(me)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950">
        <p className="text-lg font-semibold text-purple-600 dark:text-purple-300">Chargement du menu…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950">
      <nav className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-green-500 flex items-center justify-center">
                <Music className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent">
                Blindify
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden text-sm text-gray-600 dark:text-gray-400 sm:block">
                {user ? `Connecté en tant que ${user.username || user.spotify_id}` : ""}
              </span>
              <Link
                href="/profile"
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                <User className="w-4 h-4" />
                <span className="text-sm font-medium">Profil</span>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-12"
        >
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white">
              Choisis ton <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent">mode de jeu</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Solo ou entre amis, prouve ta culture musicale
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="group"
            >
              <Link href="/solo">
                <div className="relative p-8 rounded-3xl bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-2xl hover:shadow-purple-500/20 transition-all group-hover:scale-[1.02]">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Play className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    Mode Solo
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Joue avec tes titres likés, choisis la difficulté et découvre des sons oubliés.
                  </p>
                  <ul className="space-y-2 mb-6">
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                      Playlists personnalisées
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-pink-600" />
                      3 niveaux de difficulté
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                      Progression sauvegardée
                    </li>
                  </ul>
                  <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-800">
                    <span className="text-sm font-semibold text-purple-600">Lancer une partie</span>
                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:bg-purple-600 transition-colors">
                      <Play className="w-5 h-5 text-purple-600 group-hover:text-white transition-colors" />
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="group"
            >
              <div className="relative p-8 rounded-3xl bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 opacity-60">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-400 flex items-center justify-center mb-6">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                  Multijoueur (bientôt)
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Invitations instantanées, classement en direct et playlists partagées.
                </p>
                <div className="rounded-full bg-gray-100 dark:bg-gray-800 px-4 py-2 text-sm font-medium w-max">
                  En construction
                </div>
              </div>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <Link href="/profile">
              <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-lg transition-all">
                <User className="w-8 h-8 text-purple-600 mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Profil</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Badges & stats</p>
              </div>
            </Link>
            <Link href="/leaderboard">
              <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-green-600 hover:shadow-lg transition-all">
                <Trophy className="w-8 h-8 text-green-600 mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Classement</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Top joueurs</p>
              </div>
            </Link>
            <Link href="/history">
              <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-pink-600 hover:shadow-lg transition-all">
                <History className="w-8 h-8 text-pink-600 mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Historique</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Parties jouées</p>
              </div>
            </Link>
            <Link href="/stats">
              <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-lg transition-all">
                <BarChart3 className="w-8 h-8 text-purple-600 mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Statistiques</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Performances</p>
              </div>
            </Link>
          </div>

          <div className="text-center">
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Paramètres</span>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
