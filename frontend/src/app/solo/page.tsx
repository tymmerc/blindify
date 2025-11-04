"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Play, Music, Zap, Star } from "lucide-react"

export default function SoloPage() {
  const router = useRouter()
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal")
  const [source, setSource] = useState<"liked" | "playlist" | "top-tracks">("liked")

  const startGame = () => {
    router.push(`/game?difficulty=${difficulty}&source=${source}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950">
      {/* Header */}
      <nav className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="text-gray-600 dark:text-gray-400 hover:text-purple-600 transition"
          >
            ← Retour
          </button>
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent">
            Mode Solo
          </h1>
          <div className="w-16" /> {/* Spacer */}
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Description */}
          <div className="text-center space-y-4">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-purple-600 to-green-500 flex items-center justify-center">
              <Music className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Prêt à jouer ?
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Joue avec tes titres likés, choisis la difficulté et découvre des sons oubliés.
            </p>
          </div>

          {/* Settings Card */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-xl border border-gray-200 dark:border-gray-800 space-y-8">
            {/* Source Selection */}
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-gray-900 dark:text-white">
                Source des musiques
              </label>
              <div className="grid md:grid-cols-3 gap-4">
                <button
                  onClick={() => setSource("liked")}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    source === "liked"
                      ? "border-purple-600 bg-purple-50 dark:bg-purple-900/20"
                      : "border-gray-200 dark:border-gray-800 hover:border-purple-300"
                  }`}
                >
                  <Star className={`w-8 h-8 mb-3 ${source === "liked" ? "text-purple-600" : "text-gray-400"}`} />
                  <h3 className="font-bold text-gray-900 dark:text-white mb-1">Titres likés</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Tes coups de cœur</p>
                </button>

                <button
                  onClick={() => setSource("playlist")}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    source === "playlist"
                      ? "border-pink-600 bg-pink-50 dark:bg-pink-900/20"
                      : "border-gray-200 dark:border-gray-800 hover:border-pink-300"
                  }`}
                >
                  <Music className={`w-8 h-8 mb-3 ${source === "playlist" ? "text-pink-600" : "text-gray-400"}`} />
                  <h3 className="font-bold text-gray-900 dark:text-white mb-1">Playlist</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Choisis une playlist</p>
                </button>

                <button
                  onClick={() => setSource("top-tracks")}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    source === "top-tracks"
                      ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                      : "border-gray-200 dark:border-gray-800 hover:border-green-300"
                  }`}
                >
                  <Zap className={`w-8 h-8 mb-3 ${source === "top-tracks" ? "text-green-600" : "text-gray-400"}`} />
                  <h3 className="font-bold text-gray-900 dark:text-white mb-1">Top Tracks</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Tes plus écoutés</p>
                </button>
              </div>
            </div>

            {/* Difficulty Selection */}
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-gray-900 dark:text-white">
                Difficulté
              </label>
              <div className="grid md:grid-cols-3 gap-4">
                <button
                  onClick={() => setDifficulty("easy")}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    difficulty === "easy"
                      ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                      : "border-gray-200 dark:border-gray-800 hover:border-green-300"
                  }`}
                >
                  <div className={`text-2xl font-bold mb-2 ${difficulty === "easy" ? "text-green-600" : "text-gray-400"}`}>
                    Facile
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">30 secondes par morceau</p>
                </button>

                <button
                  onClick={() => setDifficulty("normal")}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    difficulty === "normal"
                      ? "border-purple-600 bg-purple-50 dark:bg-purple-900/20"
                      : "border-gray-200 dark:border-gray-800 hover:border-purple-300"
                  }`}
                >
                  <div className={`text-2xl font-bold mb-2 ${difficulty === "normal" ? "text-purple-600" : "text-gray-400"}`}>
                    Normal
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">15 secondes par morceau</p>
                </button>

                <button
                  onClick={() => setDifficulty("hard")}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    difficulty === "hard"
                      ? "border-pink-600 bg-pink-50 dark:bg-pink-900/20"
                      : "border-gray-200 dark:border-gray-800 hover:border-pink-300"
                  }`}
                >
                  <div className={`text-2xl font-bold mb-2 ${difficulty === "hard" ? "text-pink-600" : "text-gray-400"}`}>
                    Difficile
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">7 secondes par morceau</p>
                </button>
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={startGame}
              className="w-full py-6 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 text-white font-bold text-xl flex items-center justify-center gap-3 hover:shadow-2xl hover:shadow-purple-500/50 hover:scale-[1.02] transition-all"
            >
              <Play className="w-6 h-6" />
              Lancer une partie
            </button>
          </div>

          {/* Tips */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
              <h4 className="font-bold text-purple-900 dark:text-purple-100 mb-2">🎯 Précision</h4>
              <p className="text-sm text-purple-700 dark:text-purple-300">
                Plus tu réponds vite, plus tu gagnes de points
              </p>
            </div>
            <div className="p-4 rounded-xl bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800">
              <h4 className="font-bold text-pink-900 dark:text-pink-100 mb-2">⚡ Combo</h4>
              <p className="text-sm text-pink-700 dark:text-pink-300">
                Enchaîne les bonnes réponses pour le multiplicateur
              </p>
            </div>
            <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <h4 className="font-bold text-green-900 dark:text-green-100 mb-2">🏆 Score</h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                Bats ton record personnel et grimpe au classement
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}