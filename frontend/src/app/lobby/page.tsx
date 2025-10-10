"use client"
import { useState, useEffect } from "react"
import type React from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Navbar from "@/components/Navbar"
import { api } from "@/lib/api"
import { PageTransition } from "@/lib/page-transition"

type LobbyView = "choice" | "create" | "join" | "room"

interface Player {
  id: string
  username: string
  isHost: boolean
}

interface Room {
  id: string
  code: string
  name: string
  hostId: string
  maxPlayers: number
  questionCount: number
  players: Player[]
}

export default function LobbyPage() {
  const router = useRouter()
  const [view, setView] = useState<LobbyView>("choice")
  const [roomName, setRoomName] = useState("")
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [questionCount, setQuestionCount] = useState(20)
  const [roomCode, setRoomCode] = useState("")
  const [room, setRoom] = useState<Room | null>(null)
  const [copied, setCopied] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>("")

  useEffect(() => {
    // Check auth and get current user
    api.checkAuth().then((user: { id: string; username: string } | null) => {
      if (user) {
        setCurrentUserId(user.id)
      }
    })
  }, [])

  const handleCreateRoom = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      const response = await api.createRoom({
        name: roomName,
        maxPlayers,
        questionCount,
      })
      setRoom(response.room)
      setView("room")
    } catch (error) {
      console.error("Failed to create room:", error)
      // For now, create a mock room for UI testing
      const mockRoom: Room = {
        id: "mock-room-id",
        code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        name: roomName,
        hostId: currentUserId,
        maxPlayers,
        questionCount,
        players: [
          {
            id: currentUserId,
            username: "Toi",
            isHost: true,
          },
        ],
      }
      setRoom(mockRoom)
      setView("room")
    }
  }

  const handleJoinRoom = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      const response = await api.joinRoom(roomCode)
      setRoom(response.room)
      setView("room")
    } catch (error) {
      console.error("Failed to join room:", error)
      alert("Code de salle invalide ou salle pleine")
    }
  }

  const handleLeaveRoom = async () => {
    if (!room) return
    try {
      await api.leaveRoom(room.id)
      setRoom(null)
      setView("choice")
    } catch (error) {
      console.error("Failed to leave room:", error)
      setRoom(null)
      setView("choice")
    }
  }

  const handleStartGame = async () => {
    if (!room) return
    try {
      await api.startMultiplayerGame(room.id)
      router.push(`/game?mode=multi&roomId=${room.id}`)
    } catch (error) {
      console.error("Failed to start game:", error)
      alert("Impossible de démarrer la partie")
    }
  }

  const copyRoomCode = () => {
    if (room) {
      navigator.clipboard.writeText(room.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const isHost = room && room.hostId === currentUserId

  return (
    <PageTransition>
      <main className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100 dark:from-purple-950 dark:via-pink-950 dark:to-purple-900 transition-colors duration-300">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-0 w-1/3 h-full bg-gradient-to-br from-purple-500 to-pink-500 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-1/3 h-full bg-gradient-to-tl from-pink-500 to-purple-500 blur-3xl" />
        </div>

        <Navbar />

        <div className="flex-1 flex flex-col items-center justify-center px-4 py-32 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-2xl"
          >
            <Link
              href="/menu"
              className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-6 font-semibold transition-colors"
            >
              ← Retour au menu
            </Link>

            <AnimatePresence mode="wait">
              {view === "choice" && (
                <motion.div
                  key="choice"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="bg-white/80 backdrop-blur-sm border-2 border-purple-200 shadow-xl rounded-xl p-8"
                >
                  <div className="text-center mb-8">
                    <div className="text-6xl mb-4">👥</div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                      Mode Multijoueur
                    </h1>
                    <p className="text-lg text-gray-600">Joue avec tes amis en temps réel</p>
                  </div>
                  <div className="space-y-4">
                    <button
                      onClick={() => setView("create")}
                      className="w-full h-16 text-lg font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl transition-all transform hover:scale-105"
                    >
                      Créer une partie
                    </button>
                    <button
                      onClick={() => setView("join")}
                      className="w-full h-16 text-lg font-semibold border-2 border-purple-300 hover:bg-purple-50 text-purple-700 rounded-xl transition-all"
                    >
                      Rejoindre une partie
                    </button>
                  </div>
                </motion.div>
              )}

              {view === "create" && (
                <motion.div
                  key="create"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="bg-white/80 backdrop-blur-sm border-2 border-purple-200 shadow-xl rounded-xl p-8"
                >
                  <h2 className="text-2xl font-bold text-purple-900 mb-2">Créer une partie</h2>
                  <p className="text-gray-600 mb-6">Configure ta partie multijoueur</p>

                  <form onSubmit={handleCreateRoom} className="space-y-6">
                    <div className="space-y-2">
                      <label htmlFor="roomName" className="block text-sm font-semibold text-gray-700">
                        Nom de la partie
                      </label>
                      <input
                        id="roomName"
                        type="text"
                        placeholder="Ma super partie"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-purple-200 focus:border-purple-400 rounded-lg outline-none transition-colors"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="maxPlayers" className="block text-sm font-semibold text-gray-700">
                        Nombre de joueurs max
                      </label>
                      <input
                        id="maxPlayers"
                        type="number"
                        min={2}
                        max={8}
                        value={maxPlayers}
                        onChange={(e) => setMaxPlayers(Number.parseInt(e.target.value))}
                        className="w-full px-4 py-3 border-2 border-purple-200 focus:border-purple-400 rounded-lg outline-none transition-colors"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="questionCount" className="block text-sm font-semibold text-gray-700">
                        Nombre de questions
                      </label>
                      <input
                        id="questionCount"
                        type="number"
                        min={5}
                        max={50}
                        step={5}
                        value={questionCount}
                        onChange={(e) => setQuestionCount(Number.parseInt(e.target.value))}
                        className="w-full px-4 py-3 border-2 border-purple-200 focus:border-purple-400 rounded-lg outline-none transition-colors"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setView("choice")}
                        className="flex-1 h-12 font-semibold border-2 border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={!roomName.trim()}
                        className="flex-1 h-12 font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Créer
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {view === "join" && (
                <motion.div
                  key="join"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="bg-white/80 backdrop-blur-sm border-2 border-purple-200 shadow-xl rounded-xl p-8"
                >
                  <h2 className="text-2xl font-bold text-purple-900 mb-2">Rejoindre une partie</h2>
                  <p className="text-gray-600 mb-6">Entre le code de la partie</p>

                  <form onSubmit={handleJoinRoom} className="space-y-6">
                    <div className="space-y-2">
                      <label htmlFor="roomCode" className="block text-sm font-semibold text-gray-700">
                        Code de la partie
                      </label>
                      <input
                        id="roomCode"
                        type="text"
                        placeholder="ABC123"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        className="w-full px-4 py-3 border-2 border-purple-200 focus:border-purple-400 rounded-lg outline-none transition-colors text-2xl text-center font-bold tracking-wider"
                        maxLength={6}
                        required
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setView("choice")}
                        className="flex-1 h-12 font-semibold border-2 border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={roomCode.length !== 6}
                        className="flex-1 h-12 font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Rejoindre
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {view === "room" && room && (
                <motion.div
                  key="room"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="bg-white/80 backdrop-blur-sm border-2 border-purple-200 shadow-xl rounded-xl p-8"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-purple-900">{room.name}</h2>
                      <p className="text-gray-600">
                        {room.players.length}/{room.maxPlayers} joueurs • {room.questionCount} questions
                      </p>
                    </div>
                    <button
                      onClick={handleLeaveRoom}
                      className="w-10 h-10 border-2 border-red-300 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center"
                      title="Quitter"
                    >
                      ←
                    </button>
                  </div>

                  <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl p-6 border-2 border-purple-200 mb-6">
                    <p className="text-sm text-purple-700 font-semibold mb-2 text-center">Code de la partie</p>
                    <div className="flex items-center justify-center gap-3">
                      <p className="text-4xl font-bold text-purple-900 tracking-wider">{room.code}</p>
                      <button
                        onClick={copyRoomCode}
                        className="w-10 h-10 border-2 border-purple-300 hover:bg-purple-50 rounded-lg transition-colors flex items-center justify-center"
                        title="Copier"
                      >
                        {copied ? "✓" : "📋"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <h3 className="font-semibold text-purple-900 text-lg">Joueurs</h3>
                    <div className="space-y-2">
                      {room.players.map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold">
                              {player.username[0].toUpperCase()}
                            </div>
                            <span className="font-semibold text-purple-900">{player.username}</span>
                          </div>
                          {player.isHost && (
                            <div className="flex items-center gap-1 text-yellow-600 font-semibold">
                              <span className="text-xl">👑</span>
                              <span className="text-sm">Host</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {isHost && (
                    <button
                      onClick={handleStartGame}
                      disabled={room.players.length < 2}
                      className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Démarrer la partie
                    </button>
                  )}

                  {!isHost && (
                    <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
                      <p className="text-purple-700 font-semibold">En attente que l&apos;hôte démarre la partie...</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>
    </PageTransition>
  )
}
