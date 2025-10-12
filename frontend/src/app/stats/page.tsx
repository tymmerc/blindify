"use client"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Navbar from "@/components/Navbar"
import LayoutGradient from "@/components/LayoutGradient"
import { api } from "@/lib/api"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"

interface DetailedStats {
  totalGames: number
  averageScore: number
  bestScore: number
  favoriteArtists: { name: string; count: number }[]
}

export default function StatsPage() {
  const [stats, setStats] = useState<DetailedStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .getDetailedStats()
      .then((d) => setStats(d))
      .finally(() => setLoading(false))
  }, [])

  return (
    <LayoutGradient>
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-16 max-w-4xl mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full text-center">
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Tes statistiques
          </h1>
          <p className="text-lg text-gray-600 mb-10">Synthèse de tes performances.</p>

          {loading && <p className="text-gray-700">Chargement…</p>}

          {!loading && stats && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white/80 border-2 border-purple-200 rounded-2xl p-6">
                  <p className="text-3xl font-bold text-purple-600">{stats.totalGames}</p>
                  <p className="text-gray-700 mt-1">Parties jouées</p>
                </div>
                <div className="bg-white/80 border-2 border-pink-200 rounded-2xl p-6">
                  <p className="text-3xl font-bold text-pink-600">{stats.averageScore.toFixed(1)} / 10</p>
                  <p className="text-gray-700 mt-1">Score moyen</p>
                </div>
                <div className="bg-white/80 border-2 border-purple-200 rounded-2xl p-6">
                  <p className="text-3xl font-bold text-purple-600">{stats.bestScore}</p>
                  <p className="text-gray-700 mt-1">Meilleur score</p>
                </div>
              </div>

              <div className="bg-white/80 border-2 border-purple-200 rounded-2xl p-8">
                <h2 className="text-2xl font-bold mb-6 text-gray-800">Artistes les plus fréquents</h2>
                {stats.favoriteArtists?.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.favoriteArtists}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#a855f7" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-600">Aucune donnée pour l’instant.</p>
                )}
              </div>
            </div>
          )}

          {!loading && !stats && <p className="text-gray-700">Aucune statistique disponible.</p>}
        </motion.div>
      </main>
    </LayoutGradient>
  )
}
