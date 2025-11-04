"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Users, Plus, LogIn, Loader2 } from "lucide-react"
import { api } from "@/lib/api"

export default function LobbyPage() {
  const router = useRouter()
  const [roomCode, setRoomCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreateRoom = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.createRoom()
      if (data?.roomCode) {
        router.push(`/app/room/${data.roomCode}`)
      } else {
        throw new Error("Code de salle manquant")
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de la création de la salle")
    } finally {
      setLoading(false)
    }
  }

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) {
      setError("Entre un code de salle")
      return
    }

    setLoading(true)
    setError(null)
    try {
      await api.joinRoom(roomCode.toUpperCase())
      router.push(`/app/room/${roomCode.toUpperCase()}`)
    } catch (err: any) {
      setError(err.message || "Erreur lors de la connexion à la salle")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-purple-600 via-pink-500 to-green-500 flex items-center justify-center">
            <Users className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-black bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent mb-4">
            Multijoueur
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Crée ou rejoins une salle pour jouer avec tes amis
          </p>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-100"
          >
            {error}
          </motion.div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Créer une salle */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="p-8 rounded-2xl bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Plus className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Créer une salle
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Invite jusqu'à 20 amis
                </p>
              </div>
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={loading}
              className="w-full px-6 py-4 rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 text-white font-bold text-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Créer une salle
                </>
              )}
            </button>
          </motion.div>

          {/* Rejoindre une salle */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="p-8 rounded-2xl bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <LogIn className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Rejoindre une salle
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Entre le code de la salle
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="CODE123"
                maxLength={6}
                className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-xl text-center uppercase tracking-widest focus:border-green-600 focus:outline-none transition-colors"
              />

              <button
                onClick={handleJoinRoom}
                disabled={loading || !roomCode.trim()}
                className="w-full px-6 py-4 rounded-full bg-green-600 text-white font-bold text-lg hover:bg-green-700 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Connexion...
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Rejoindre
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 p-6 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
        >
          <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-2">
            💡 Comment ça marche ?
          </h3>
          <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <li>• Le créateur de la salle partage le code avec ses amis</li>
            <li>• Tous les joueurs doivent être connectés avec Spotify</li>
            <li>• La partie démarre quand tous sont prêts</li>
            <li>• Le premier à trouver le titre gagne !</li>
          </ul>
        </motion.div>
      </div>
    </div>
  )
}