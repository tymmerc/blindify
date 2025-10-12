"use client"
import { useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import Navbar from "@/components/Navbar"
import LayoutGradient from "@/components/LayoutGradient"
import { api } from "@/lib/api"

export default function LobbyPage() {
  const [roomCode, setRoomCode] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const data = await api.createRoom({ name: "Salle de jeu", maxPlayers: 6, questionCount: 10 })
      if (data?.code) window.location.href = `/room/${data.code}`
      else throw new Error("Code de salle manquant")
    } catch {
      setError("Impossible de créer une salle.")
    } finally {
      setCreating(false)
    }
  }

  const join = async () => {
    setError(null)
    if (roomCode.trim().length !== 6) {
      setError("Code invalide")
      return
    }
    try {
      const data = await api.joinRoom(roomCode.trim())
      if (data?.roomId) window.location.href = `/room/${data.roomId}`
      else throw new Error("Salle introuvable")
    } catch {
      setError("Salle introuvable ou non disponible.")
    }
  }

  return (
    <LayoutGradient>
      <Navbar />
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-28">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
          <Link href="/menu" className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-6 font-semibold">
            ← Retour au menu
          </Link>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200 shadow-xl p-8">
            <div className="mb-6">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                Multijoueur
              </h1>
              <p className="text-lg text-gray-600">Crée une salle ou rejoins une partie existante.</p>
            </div>

            <div className="mb-8 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-100">
              <h3 className="text-2xl font-semibold mb-4 text-gray-800">Créer une salle</h3>
              <button
                onClick={create}
                disabled={creating}
                className="w-full py-3 rounded-xl text-lg font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
              >
                {creating ? "Création…" : "Créer une salle"}
              </button>
            </div>

            <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-100">
              <h3 className="text-2xl font-semibold mb-3 text-gray-800">Rejoindre une salle</h3>
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="AB12CD"
                className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-lg text-gray-800 mb-3 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400 text-center tracking-wider"
                maxLength={6}
              />
              <button onClick={join} className="w-full py-3 rounded-xl text-lg font-semibold text-white bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700">
                Rejoindre
              </button>
              {error && <p className="text-red-600 font-medium mt-3 text-center">{error}</p>}
            </div>
          </div>
        </motion.div>
      </div>
    </LayoutGradient>
  )
}
