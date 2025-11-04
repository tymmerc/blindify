"use client"

import { motion } from "framer-motion"
import { Calendar, Trophy, Users, Clock } from "lucide-react"
import PageHeader from "@/components/ui/PageHeader"

const mockHistory = [
  { 
    id: 1,
    date: "31 Oct 2025", 
    score: 820, 
    mode: "Solo",
    duration: "3:45",
    correct: 8,
    total: 10
  },
  { 
    id: 2,
    date: "30 Oct 2025", 
    score: 1040, 
    mode: "Multijoueur",
    duration: "5:12",
    correct: 10,
    total: 10
  },
  { 
    id: 3,
    date: "28 Oct 2025", 
    score: 760, 
    mode: "Solo",
    duration: "4:20",
    correct: 7,
    total: 10
  },
]

export default function HistoryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <PageHeader title="Historique" subtitle="Tes dernières parties" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-4"
        >
          {mockHistory.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600 dark:text-gray-400">
                Aucune partie jouée pour le moment
              </p>
            </div>
          ) : (
            mockHistory.map((game, i) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 dark:hover:border-purple-600 transition-all shadow-sm hover:shadow-lg"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Date & Mode */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm">{game.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {game.mode === "Solo" ? (
                        <Trophy className="w-5 h-5 text-purple-600" />
                      ) : (
                        <Users className="w-5 h-5 text-green-500" />
                      )}
                      <span className="font-semibold text-lg">{game.mode}</span>
                    </div>
                  </div>

                  {/* Center: Stats */}
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Score</p>
                      <p className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent">
                        {game.score}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Précision</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {game.correct}/{game.total}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Temps</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-1">
                        <Clock className="w-4 h-4" />
                        {game.duration}
                      </p>
                    </div>
                  </div>

                  {/* Right: Badge */}
                  <div>
                    {game.correct === game.total && (
                      <div className="px-4 py-2 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-500 text-green-700 dark:text-green-300 text-sm font-bold">
                        Parfait ! 🎉
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>
      </div>
    </div>
  )
}