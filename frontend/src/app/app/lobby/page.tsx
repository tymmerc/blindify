"use client"
import { useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import Navbar from "@/components/ui/navbar"
import LayoutGradient from "@/components/ui/layout-gradient"
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
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-32 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-2xl"
        >
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 font-medium transition-colors duration-300 group"
          >
            <motion.span
              animate={{ x: [-3, 0, -3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              ←
            </motion.span>
            Retour au menu
          </Link>

          <div className="text-center mb-10">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="text-6xl mb-4"
            >
              👥
            </motion.div>
            <h1 className="text-5xl font-bold text-gradient mb-3">
              Multijoueur
            </h1>
            <p className="text-xl text-gray-400">
              Crée une salle ou rejoins une partie existante
            </p>
          </div>

          {/* Créer une salle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-strong rounded-3xl p-8 mb-6"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-3xl">
                ✨
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-white">Créer une salle</h3>
                <p className="text-gray-400">Invite tes amis à te rejoindre</p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: creating ? 1 : 1.02 }}
              whileTap={{ scale: creating ? 1 : 0.98 }}
              onClick={create}
              disabled={creating}
              className={`w-full py-4 rounded-2xl text-lg font-semibold text-white transition-all duration-300 ${
                creating
                  ? "bg-gray-700 cursor-not-allowed opacity-50"
                  : "bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 hover-lift"
              }`}
            >
              {creating ? (
                <span className="flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Création en cours…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>🚀</span>
                  Créer une nouvelle salle
                </span>
              )}
            </motion.button>
          </motion.div>

          {/* Rejoindre une salle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-strong rounded-3xl p-8"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center text-3xl">
                🔗
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-white">Rejoindre une salle</h3>
                <p className="text-gray-400">Entre le code à 6 caractères</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <input
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="AB12CD"
                  className="w-full glass hover:glass-strong rounded-2xl px-6 py-4 text-2xl text-white text-center tracking-[0.5em] font-bold placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all duration-300"
                  maxLength={6}
                />
                {roomCode && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => setRoomCode("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full glass hover:glass-strong flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                  >
                    ✕
                  </motion.button>
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={join}
                disabled={roomCode.length !== 6}
                className={`w-full py-4 rounded-2xl text-lg font-semibold text-white transition-all duration-300 ${
                  roomCode.length === 6
                    ? "bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 hover-lift"
                    : "bg-gray-700 cursor-not-allowed opacity-50"
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <span>🎮</span>
                  Rejoindre la partie
                </span>
              </motion.button>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl p-4 border border-red-500/30"
                >
                  <div className="flex items-center gap-3 text-red-400">
                    <span className="text-xl">⚠️</span>
                    <p className="font-medium">{error}</p>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-6 glass rounded-2xl p-6"
          >
            <h4 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              Comment ça marche ?
            </h4>
            <div className="space-y-2 text-gray-400 text-sm">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs flex-shrink-0">
                  1
                </span>
                <p>Le créateur reçoit un code unique à partager</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-xs flex-shrink-0">
                  2
                </span>
                <p>Les joueurs entrent le code pour rejoindre</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-xs flex-shrink-0">
                  3
                </span>
                <p>Tout le monde joue en même temps !</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </LayoutGradient>
  )
}