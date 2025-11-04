"use client"

import { motion } from "framer-motion"
import { Trophy, Medal, Award, Crown } from "lucide-react"
import PageHeader from "@/components/ui/PageHeader"

const players = [
  { name: "Tyméo", score: 1240, avatar: "🎸" },
  { name: "Lisandru", score: 1170, avatar: "🎹" },
  { name: "Charles", score: 1090, avatar: "🎤" },
  { name: "Kevin", score: 970, avatar: "🥁" },
  { name: "Marie", score: 890, avatar: "🎺" },
  { name: "Lucas", score: 820, avatar: "🎻" },
]

const podiumColors = {
  0: { border: "border-yellow-500", bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-600", icon: Crown },
  1: { border: "border-gray-400", bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600", icon: Medal },
  2: { border: "border-orange-500", bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-600", icon: Award }
}

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <PageHeader title="Leaderboard" subtitle="Les meilleurs joueurs" />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="space-y-3"
        >
          {players.map((player, i) => {
            const isTopThree = i < 3
            const colors = isTopThree ? podiumColors[i as 0 | 1 | 2] : null
            const Icon = colors?.icon

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`p-6 rounded-2xl bg-white dark:bg-gray-900 border-2 transition-all shadow-sm hover:shadow-xl ${
                  colors
                    ? `${colors.border} ${colors.bg}`
                    : "border-gray-200 dark:border-gray-800 hover:border-purple-600"
                }`}
              >
                <div className="flex items-center justify-between">
                  {/* Left: Rank + Player */}
                  <div className="flex items-center gap-4">
                    {/* Rank Badge */}
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl ${
                        colors
                          ? `${colors.bg} ${colors.text}`
                          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {isTopThree && Icon ? (
                        <Icon className="w-6 h-6" />
                      ) : (
                        `#${i + 1}`
                      )}
                    </div>

                    {/* Avatar + Name */}
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{player.avatar}</div>
                      <div>
                        <p className="font-bold text-lg text-gray-900 dark:text-white">
                          {player.name}
                        </p>
                        {isTopThree && (
                          <p className={`text-sm font-semibold ${colors?.text}`}>
                            Top {i + 1}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Score */}
                  <div className="text-right">
                    <p
                      className={`text-3xl font-black ${
                        isTopThree
                          ? "bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {player.score}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">points</p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Footer Info */}
        <div className="mt-8 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-center">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            🏆 Le classement est mis à jour en temps réel
          </p>
        </div>
      </div>
    </div>
  )
}