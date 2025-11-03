"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter, useSearchParams } from "next/navigation"
import { Music, Play, Pause, Trophy, Zap, CheckCircle, XCircle } from "lucide-react"
import { api } from "@/lib/api"

type Difficulty = "easy" | "normal" | "hard"
type Source = "liked" | "playlist" | "top-tracks"

interface Track {
  id: string
  title: string
  artist: string
  preview_url: string
  album_cover: string
}

interface GameState {
  sessionId: number | null
  tracks: Track[]
  currentTrackIndex: number
  score: number
  timeLeft: number
  isPlaying: boolean
  userAnswer: string
  showResult: boolean
  resultData: { isCorrect: boolean; points: number } | null
  gameOver: boolean
  currentStreak: number
  maxStreak: number
  startTime: number
}

export default function GamePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "normal"
  const source = (searchParams.get("source") as Source) || "liked"
  
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<GameState>({
    sessionId: null,
    tracks: [],
    currentTrackIndex: 0,
    score: 0,
    timeLeft: difficulty === "easy" ? 30 : difficulty === "normal" ? 15 : 7,
    isPlaying: false,
    userAnswer: "",
    showResult: false,
    resultData: null,
    gameOver: false,
    currentStreak: 0,
    maxStreak: 0,
    startTime: Date.now()
  })

  const currentTrack = state.tracks[state.currentTrackIndex]

  // Charger la session
  useEffect(() => {
    const initGame = async () => {
      try {
        const response = await api.startSoloGame({ 
          difficulty, 
          source,
          count: 10 
        })
        
        // Mapper les champs de l'API backend vers le format frontend
        const mappedTracks = response.tracks.map((t: any) => ({
          id: t.spotify_track_id,
          title: t.title,
          artist: t.artist,
          preview_url: t.preview_url,
          album_cover: t.album_cover
        }))
        
        setState(prev => ({
          ...prev,
          sessionId: response.sessionId,
          tracks: mappedTracks
        }))
        setLoading(false)
      } catch (error: any) {
        console.error("Erreur init:", error)
        // Si 401, rediriger vers la connexion Spotify
        if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
          router.push("/auth/login")
        } else {
          router.push("/app/menu")
        }
      }
    }
    initGame()
  }, [difficulty, source, router])

  // Gérer l'audio
  useEffect(() => {
    if (!currentTrack?.preview_url) return

    const audio = new Audio(currentTrack.preview_url)
    audioRef.current = audio

    audio.addEventListener("canplay", () => {
      audio.play().catch(console.error)
      setState(prev => ({ ...prev, isPlaying: true }))
    })

    return () => {
      audio.pause()
      audio.src = ""
      audioRef.current = null
    }
  }, [currentTrack])

  // Timer
  useEffect(() => {
    if (state.isPlaying && state.timeLeft > 0 && !state.showResult) {
      const timer = setInterval(() => {
        setState(prev => ({
          ...prev,
          timeLeft: prev.timeLeft - 1
        }))
      }, 1000)
      return () => clearInterval(timer)
    } else if (state.timeLeft === 0 && !state.showResult) {
      submitAnswer()
    }
  }, [state.isPlaying, state.timeLeft, state.showResult])

  const submitAnswer = async () => {
    if (state.showResult || !currentTrack) return

    if (audioRef.current) {
      audioRef.current.pause()
    }
    setState(prev => ({ ...prev, isPlaying: false }))

    try {
      const maxTime = difficulty === "easy" ? 30 : difficulty === "normal" ? 15 : 7
      const responseTimeMs = (maxTime - state.timeLeft) * 1000

      const response = await api.submitAnswer({
        sessionId: state.sessionId!,
        trackId: currentTrack.id,
        userAnswer: state.userAnswer,
        correctAnswer: `${currentTrack.artist} - ${currentTrack.title}`,
        responseTimeMs,
        questionNumber: state.currentTrackIndex + 1,
        skipped: state.userAnswer.trim() === ""
      })

      const isCorrect = response.is_correct || false
      const points = response.points || 0
      const newStreak = isCorrect ? state.currentStreak + 1 : 0
      
      setState(prev => ({
        ...prev,
        showResult: true,
        resultData: { isCorrect, points },
        score: prev.score + points,
        currentStreak: newStreak,
        maxStreak: Math.max(prev.maxStreak, newStreak)
      }))

      setTimeout(() => {
        nextTrack()
      }, 3000)
    } catch (error) {
      console.error("Erreur soumission:", error)
    }
  }

  const nextTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    
    if (state.currentTrackIndex >= state.tracks.length - 1) {
      setState(prev => ({ ...prev, gameOver: true }))
      if (state.sessionId) {
        api.completeGame(state.sessionId).catch(console.error)
      }
      return
    }

    const maxTime = difficulty === "easy" ? 30 : difficulty === "normal" ? 15 : 7
    
    setState(prev => ({
      ...prev,
      currentTrackIndex: prev.currentTrackIndex + 1,
      userAnswer: "",
      showResult: false,
      resultData: null,
      timeLeft: maxTime,
      isPlaying: false
    }))
  }

  const toggleAudio = () => {
    if (!audioRef.current) return

    if (state.isPlaying) {
      audioRef.current.pause()
      setState(prev => ({ ...prev, isPlaying: false }))
    } else {
      audioRef.current.play().catch(console.error)
      setState(prev => ({ ...prev, isPlaying: true }))
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !state.showResult && state.userAnswer.trim()) {
      submitAnswer()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-600 to-green-500 animate-pulse flex items-center justify-center">
            <Music className="w-10 h-10 text-white" />
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">Chargement...</p>
        </div>
      </div>
    )
  }

  if (state.gameOver) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950 flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-2xl w-full bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-2xl border border-gray-200 dark:border-gray-800"
        >
          <div className="text-center space-y-6">
            <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-green-500 flex items-center justify-center">
              <Trophy className="w-12 h-12 text-white" />
            </div>
            
            <div>
              <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-2">
                Partie terminée !
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-400">
                Bravo, tu as survécu ! 🎉
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-6 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <p className="text-sm text-purple-600 dark:text-purple-400 mb-1">Score</p>
                <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                  {state.score}
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800">
                <p className="text-sm text-pink-600 dark:text-pink-400 mb-1">Précision</p>
                <p className="text-3xl font-bold text-pink-900 dark:text-pink-100">
                  {Math.round((state.score / (state.tracks.length * 1000)) * 100)}%
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-600 dark:text-green-400 mb-1">Combo Max</p>
                <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                  x{state.maxStreak}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => router.push("/app/solo")}
                className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 text-white font-bold hover:shadow-xl transition-all"
              >
                Rejouer
              </button>
              <button
                onClick={() => router.push("/app/menu")}
                className="flex-1 py-4 rounded-2xl border-2 border-gray-300 dark:border-gray-700 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
              >
                Menu
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950">
      {/* Header */}
      <nav className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/app/menu")}
                className="text-gray-600 dark:text-gray-400 hover:text-purple-600 transition"
              >
                ← Quitter
              </button>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Morceau {state.currentTrackIndex + 1}/{state.tracks.length}
              </span>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-purple-600" />
                <span className="text-xl font-bold text-gray-900 dark:text-white">
                  {state.score}
                </span>
              </div>
              {state.currentStreak > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30">
                  <Zap className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-bold text-green-900 dark:text-green-100">
                    x{state.currentStreak}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Game Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {!state.showResult ? (
            <motion.div
              key="game"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Timer Circle */}
              <div className="text-center">
                <div className="relative w-32 h-32 mx-auto">
                  <svg className="transform -rotate-90 w-32 h-32">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-gray-200 dark:text-gray-800"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={2 * Math.PI * 56}
                      strokeDashoffset={2 * Math.PI * 56 * (1 - state.timeLeft / (difficulty === "easy" ? 30 : difficulty === "normal" ? 15 : 7))}
                      className={`transition-all ${
                        state.timeLeft > 5 ? "text-green-500" : "text-pink-500"
                      }`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-4xl font-black text-gray-900 dark:text-white">
                      {state.timeLeft}
                    </span>
                  </div>
                </div>
              </div>

              {/* Question Card */}
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-xl border border-gray-200 dark:border-gray-800">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center animate-pulse">
                    <Music className="w-10 h-10 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Quel est ce morceau ?
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    Devine le titre ou l'artiste
                  </p>
                </div>

                <div className="space-y-4">
                  <input
                    ref={inputRef}
                    type="text"
                    value={state.userAnswer}
                    onChange={(e) => setState(prev => ({ ...prev, userAnswer: e.target.value }))}
                    onKeyPress={handleKeyPress}
                    placeholder="Tape ta réponse..."
                    className="w-full px-6 py-4 rounded-2xl border-2 border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-lg font-medium focus:border-purple-600 focus:outline-none transition-colors"
                    autoFocus
                  />

                  <button
                    onClick={submitAnswer}
                    disabled={!state.userAnswer.trim()}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 text-white font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl transition-all"
                  >
                    Valider
                  </button>
                </div>
              </div>

              {/* Audio Control */}
              <div className="flex justify-center">
                <button
                  onClick={toggleAudio}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                >
                  {state.isPlaying ? (
                    <Pause className="w-8 h-8 text-white" />
                  ) : (
                    <Play className="w-8 h-8 text-white ml-1" />
                  )}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center"
            >
              <div className={`max-w-2xl mx-auto p-12 rounded-3xl ${
                state.resultData?.isCorrect
                  ? "bg-green-50 dark:bg-green-900/20 border-2 border-green-500"
                  : "bg-pink-50 dark:bg-pink-900/20 border-2 border-pink-500"
              }`}>
                <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${
                  state.resultData?.isCorrect
                    ? "bg-green-500"
                    : "bg-pink-500"
                }`}>
                  {state.resultData?.isCorrect ? (
                    <CheckCircle className="w-12 h-12 text-white" />
                  ) : (
                    <XCircle className="w-12 h-12 text-white" />
                  )}
                </div>

                <h2 className={`text-4xl font-black mb-4 ${
                  state.resultData?.isCorrect
                    ? "text-green-900 dark:text-green-100"
                    : "text-pink-900 dark:text-pink-100"
                }`}>
                  {state.resultData?.isCorrect ? "Bravo !" : "Dommage !"}
                </h2>

                <div className="space-y-4">
                  <p className="text-xl text-gray-900 dark:text-white">
                    <strong>{currentTrack.artist}</strong> - {currentTrack.title}
                  </p>
                  {state.resultData?.isCorrect && (
                    <p className="text-2xl font-bold text-green-600">
                      +{state.resultData.points} points
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}