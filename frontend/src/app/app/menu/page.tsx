"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Play, Users, Music, Trophy, History, Settings, User, BarChart3 } from "lucide-react"

export default function MenuPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950">
      {/* Header */}
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
            <Link
              href="/app/profile"
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            >
              <User className="w-4 h-4" />
              <span className="text-sm font-medium">Profil</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-12"
        >
          {/* Welcome Section */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white">
              Choisis ton <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent">mode de jeu</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Solo ou entre amis, prouve ta culture musicale
            </p>
          </div>

          {/* Game Modes */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Mode Solo */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="group"
            >
              <Link href="/app/solo">
                <div className="relative p-8 rounded-3xl bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-2xl hover:shadow-purple-500/20 transition-all group-hover:scale-[1.02]">
                  {/* Icon */}
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Play className="w-8 h-8 text-white" />
                  </div>

                  {/* Content */}
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    Mode Solo
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Joue avec tes titres likés, choisis la difficulté et découvre des sons oubliés.
                  </p>

                  {/* Features */}
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

                  {/* Button */}
                  <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-800">
                    <span className="text-sm font-semibold text-purple-600">Lancer une partie</span>
                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:bg-purple-600 transition-colors">
                      <Play className="w-5 h-5 text-purple-600 group-hover:text-white transition-colors" />
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>

            {/* Mode Multijoueur */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="group"
            >
              <Link href="/app/lobby">
                <div className="relative p-8 rounded-3xl bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 hover:border-green-600 hover:shadow-2xl hover:shadow-green-500/20 transition-all group-hover:scale-[1.02]">
                  {/* Icon */}
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-600 to-pink-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Users className="w-8 h-8 text-white" />
                  </div>

                  {/* Content */}
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    Mode Multijoueur
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Crée une room, partage le code et affronte tes amis comme sur Kahoot.
                  </p>

                  {/* Features */}
                  <ul className="space-y-2 mb-6">
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
                      Jusqu'à 20 joueurs
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-pink-600" />
                      Classement temps réel
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
                      Code de partie unique
                    </li>
                  </ul>

                  {/* Button */}
                  <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-800">
                    <span className="text-sm font-semibold text-green-600">Créer une Room</span>
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center group-hover:bg-green-600 transition-colors">
                      <Users className="w-5 h-5 text-green-600 group-hover:text-white transition-colors" />
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          </div>

          {/* Quick Access */}
          <div className="grid md:grid-cols-4 gap-4">
            <Link href="/app/profile">
              <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-lg transition-all">
                <User className="w-8 h-8 text-purple-600 mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Profil</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Badges & stats</p>
              </div>
            </Link>

            <Link href="/app/leaderboard">
              <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-green-600 hover:shadow-lg transition-all">
                <Trophy className="w-8 h-8 text-green-600 mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Classement</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Top joueurs</p>
              </div>
            </Link>

            <Link href="/app/history">
              <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-pink-600 hover:shadow-lg transition-all">
                <History className="w-8 h-8 text-pink-600 mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Historique</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Parties jouées</p>
              </div>
            </Link>

            <Link href="/app/stats">
              <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-lg transition-all">
                <BarChart3 className="w-8 h-8 text-purple-600 mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Statistiques</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Performances</p>
              </div>
            </Link>
          </div>

          {/* Settings Link */}
          <div className="text-center">
            <Link
              href="/app/settings"
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