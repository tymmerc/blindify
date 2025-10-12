"use client"
import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Navbar from "@/components/Navbar"
import LayoutGradient from "@/components/LayoutGradient"
import { api } from "@/lib/api"

interface Game {
  id: string
  mode: "solo" | "multiplayer"
  score: number
  correctAnswers: number
  totalQuestions: number
  date: string
  duration: number
}

export default function HistoryPage() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "solo" | "multiplayer">("all")
  const [selected, setSelected] = useState<Game | null>(null)

  useEffect(() => {
    api
      .getHistory()
      .then((d) => setGames(d.games || []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === "all" ? games : games.filter((g) => g.mode === filter)

  const dateFmt = (s: string) =>
    new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
  const dFmt = (n: number) => `${Math.floor(n / 60)}:${(n % 60).toString().padStart(2, "0")}`

  return (
    <LayoutGradient>
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-16 max-w-4xl mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full">
          <h1 className="text-6xl font-bold text-center mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Historique
          </h1>
          <p className="text-lg text-gray-600 text-center mb-10">Tes dernières parties.</p>

          <div className="flex justify-center gap-4 mb-8">
            {(["all", "solo", "multiplayer"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-6 py-2 rounded-xl font-semibold ${
                  filter === t ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white" : "bg-white/80 text-gray-700 hover:bg-white"
                }`}
              >
                {t === "all" ? "Toutes" : t === "solo" ? "Solo" : "Multijoueur"}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-center text-gray-700">Chargement…</p>
          ) : filtered.length === 0 ? (
            <div className="bg-white/80 rounded-2xl border-2 border-purple-200 p-10 text-center">Aucune partie trouvée.</div>
          ) : (
            <div className="space-y-4">
              {filtered.map((g) => (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/80 rounded-2xl border-2 border-purple-200 p-6 cursor-pointer hover:shadow"
                  onClick={() => setSelected(g)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{g.mode === "solo" ? "🎧" : "👥"}</div>
                      <div>
                        <p className="font-semibold text-gray-900">{g.mode === "solo" ? "Partie Solo" : "Partie Multijoueur"}</p>
                        <p className="text-sm text-gray-600">{dateFmt(g.date)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-purple-600">{g.score}</p>
                      <p className="text-sm text-gray-600">points</p>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm text-gray-700 mt-2">
                    <span>Bonnes réponses : {g.correctAnswers}/{g.totalQuestions}</span>
                    <span>Durée : {dFmt(g.duration)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 grid place-items-center p-4"
              onClick={() => setSelected(null)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Détails de la partie</h2>
                <div className="space-y-2 text-gray-700">
                  <p><strong>Mode :</strong> {selected.mode === "solo" ? "Solo" : "Multijoueur"}</p>
                  <p><strong>Date :</strong> {dateFmt(selected.date)}</p>
                  <p><strong>Score :</strong> {selected.score} points</p>
                  <p><strong>Bonnes réponses :</strong> {selected.correctAnswers}/{selected.totalQuestions}</p>
                  <p><strong>Durée :</strong> {dFmt(selected.duration)}</p>
                </div>
                <button onClick={() => setSelected(null)} className="w-full mt-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 rounded-xl">
                  Fermer
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </LayoutGradient>
  )
}
