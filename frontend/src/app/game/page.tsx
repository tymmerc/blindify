"use client"
import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import Navbar from "@/components/Navbar"
import LayoutGradient from "@/components/LayoutGradient"
import { api } from "@/lib/api"
import { useSound } from "@/lib/use-sound"

type Difficulty = "easy" | "normal" | "hard"

interface Track {
  id: string
  title: string
  artist: string
  preview_url: string
  album_cover: string
}

interface GameState {
  tracks: Track[]
  currentTrackIndex: number
  score: number
  timeLeft: number
  isPlaying: boolean
  selectedAnswer: string | null
  showResult: boolean
  gameOver: boolean
  difficulty: Difficulty
}

export default function GamePage() {
  const router = useRouter()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const { playSound } = useSound()
  const [options, setOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [askDifficulty, setAskDifficulty] = useState(true)
  const [state, setState] = useState<GameState>({
    tracks: [],
    currentTrackIndex: 0,
    score: 0,
    timeLeft: 10,
    isPlaying: false,
    selectedAnswer: null,
    showResult: false,
    gameOver: false,
    difficulty: "normal",
  })

  const timeFor = (d: Difficulty) => (d === "easy" ? 15 : d === "hard" ? 5 : 10)

  const start = async (d: Difficulty) => {
    const me = await api.checkAuth()
    if (!me) return router.push("/menu")
    const data = await api.startSoloGame(d)
    setState((prev) => ({ ...prev, tracks: data.tracks || [], timeLeft: timeFor(d), difficulty: d }))
    setAskDifficulty(false)
    setLoading(false)
  }

  const handleAnswer = (answer: string | null) => {
    const current = state.tracks[state.currentTrackIndex]
    const ok = answer === current.title
    playSound(ok ? "correct" : "wrong")
    setState((p) => ({
      ...p,
      selectedAnswer: answer,
      showResult: true,
      score: ok ? p.score + 1 : p.score,
    }))
    audioRef.current?.pause()
  }

  useEffect(() => {
    if (state.showResult || !state.isPlaying) return
    if (state.timeLeft <= 0) {
      handleAnswer(null)
      return
    }
    const t = setTimeout(() => {
      setState((p) => ({ ...p, timeLeft: p.timeLeft - 1 }))
      if (state.timeLeft <= 3) playSound("tick")
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timeLeft, state.isPlaying, state.showResult])

  useEffect(() => {
    if (state.tracks.length === 0) return
    const track = state.tracks[state.currentTrackIndex]
    if (!track?.preview_url) return
    audioRef.current?.pause()
    audioRef.current = new Audio(track.preview_url)
    audioRef.current.play().catch(() => void 0)
    setState((p) => ({ ...p, isPlaying: true }))
    return () => audioRef.current?.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentTrackIndex, state.tracks])

  useEffect(() => {
    if (state.tracks.length === 0) return
    const current = state.tracks[state.currentTrackIndex]
    const wrong = state.tracks.filter((t) => t.id !== current.id).sort(() => Math.random() - 0.5).slice(0, 3).map((t) => t.title)
    setOptions([...wrong, current.title].sort(() => Math.random() - 0.5))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentTrackIndex, state.tracks])

  const next = () => {
    const n = state.currentTrackIndex + 1
    if (n >= state.tracks.length) {
      playSound("gameOver")
      api.markTracksAsPlayed(state.tracks.map((t) => t.id)).catch(() => void 0)
      setState((p) => ({ ...p, gameOver: true }))
      return
    }
    setState((p) => ({
      ...p,
      currentTrackIndex: n,
      timeLeft: timeFor(state.difficulty),
      selectedAnswer: null,
      showResult: false,
    }))
  }

  const toggle = () => {
    if (!audioRef.current) return
    if (state.isPlaying) audioRef.current.pause()
    else audioRef.current.play().catch(() => void 0)
    setState((p) => ({ ...p, isPlaying: !p.isPlaying }))
  }

  if (askDifficulty)
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex flex-1 items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-3xl p-10 text-center max-w-xl w-full"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="text-6xl mb-6"
            >
              🎮
            </motion.div>
            <h1 className="text-4xl font-bold mb-8 text-gradient">
              Choisis ta difficulté
            </h1>
            <div className="space-y-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => start("easy")}
                className="w-full py-4 text-xl font-bold rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white transition-all duration-300 hover-lift"
              >
                <span className="mr-2">🟢</span> Facile — 15s
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => start("normal")}
                className="w-full py-4 text-xl font-bold rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white transition-all duration-300 hover-lift"
              >
                <span className="mr-2">🟣</span> Normal — 10s
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => start("hard")}
                className="w-full py-4 text-xl font-bold rounded-xl bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white transition-all duration-300 hover-lift"
              >
                <span className="mr-2">🔴</span> Difficile — 5s
              </motion.button>
            </div>
            <button
              onClick={() => router.push("/menu")}
              className="w-full mt-6 glass hover:glass-strong text-gray-300 hover:text-white font-semibold py-3 rounded-xl transition-all duration-300"
            >
              ← Retour au menu
            </button>
          </motion.div>
        </div>
      </LayoutGradient>
    )

  if (loading)
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xl text-gray-400">Chargement de la partie…</p>
          </motion.div>
        </div>
      </LayoutGradient>
    )

  if (state.gameOver)
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex flex-1 items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center glass-strong rounded-3xl p-10 max-w-lg w-full"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="text-7xl mb-6"
            >
              {state.score === state.tracks.length ? "🏆" : state.score >= state.tracks.length * 0.7 ? "🎉" : "🎮"}
            </motion.div>
            <h1 className="text-5xl font-bold mb-6 text-gradient">
              {state.score === state.tracks.length ? "Parfait !" : state.score >= state.tracks.length * 0.7 ? "Bien joué !" : "Partie terminée"}
            </h1>
            <div className="mb-8">
              <div className="text-6xl font-bold text-white mb-2">
                {state.score} / {state.tracks.length}
              </div>
              <div className="text-gray-400">
                {Math.round((state.score / state.tracks.length) * 100)}% de réussite
              </div>
            </div>
            <div className="flex gap-4 justify-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push("/game")}
                className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-semibold px-8 py-3 rounded-xl transition-all duration-300 hover-lift"
              >
                🔄 Rejouer
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push("/menu")}
                className="glass hover:glass-strong text-gray-300 hover:text-white font-semibold px-8 py-3 rounded-xl transition-all duration-300"
              >
                🏠 Menu
              </motion.button>
            </div>
          </motion.div>
        </div>
      </LayoutGradient>
    )

  const track = state.tracks[state.currentTrackIndex]
  const progressPercent = (state.timeLeft / timeFor(state.difficulty)) * 100

  return (
    <LayoutGradient>
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-32 pb-12 max-w-5xl mx-auto w-full">
        {/* Header avec progression */}
        <div className="flex justify-between items-center w-full mb-8">
          <div className="glass px-6 py-3 rounded-xl">
            <span className="text-gray-400 text-sm">Question</span>
            <div className="text-2xl font-bold text-white">
              {state.currentTrackIndex + 1} / {state.tracks.length}
            </div>
          </div>
          <div className="glass px-6 py-3 rounded-xl">
            <span className="text-gray-400 text-sm">Score</span>
            <div className="text-2xl font-bold text-gradient">
              {state.score}
            </div>
          </div>
        </div>

        {/* Timer */}
        <div className="w-full mb-8">
          <div className="flex justify-between items-center mb-3">
            <span className="text-lg font-semibold text-gray-300">Temps restant</span>
            <span className={`text-3xl font-bold ${state.timeLeft <= 3 ? "text-red-400 animate-pulse" : "text-indigo-400"}`}>
              {state.timeLeft}s
            </span>
          </div>
          <div className="w-full h-3 glass rounded-full overflow-hidden">
            <motion.div
              className={`h-full ${
                state.timeLeft <= 3
                  ? "bg-gradient-to-r from-red-500 to-orange-500"
                  : "bg-gradient-to-r from-indigo-500 to-purple-500"
              }`}
              initial={{ width: "100%" }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Lecteur audio */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong rounded-2xl p-8 mb-10 w-full"
        >
          <div className="flex items-center gap-6">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggle}
              className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white grid place-items-center text-3xl hover-lift"
            >
              {state.isPlaying ? "⏸" : "▶"}
            </motion.button>
            <div className="flex-1">
              <p className="text-2xl font-bold text-white mb-2">Quel est ce titre ?</p>
              <p className="text-gray-400">Écoute attentivement et choisis la bonne réponse</p>
            </div>
          </div>
        </motion.div>

        {/* Options de réponse */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-6">
          <AnimatePresence mode="wait">
            {options.map((opt, i) => {
              const selected = state.selectedAnswer === opt
              const correct = opt === track.title
              const showCorrect = state.showResult && correct
              const showWrong = state.showResult && selected && !correct
              
              return (
                <motion.button
                  key={opt}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  disabled={state.showResult}
                  onClick={() => !state.showResult && handleAnswer(opt)}
                  whileHover={!state.showResult ? { scale: 1.02 } : {}}
                  whileTap={!state.showResult ? { scale: 0.98 } : {}}
                  className={`relative w-full min-h-[80px] text-lg font-semibold rounded-2xl transition-all duration-300 ${
                    showCorrect
                      ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                      : showWrong
                      ? "bg-gradient-to-r from-red-500 to-orange-500 text-white"
                      : "glass hover:glass-strong text-gray-200 hover:text-white"
                  } ${!state.showResult && "hover-lift"}`}
                >
                  <span className="relative z-10 px-6 py-4 block">{opt}</span>
                  {showCorrect && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-3xl"
                    >
                      ✓
                    </motion.span>
                  )}
                  {showWrong && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-3xl"
                    >
                      ✗
                    </motion.span>
                  )}
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>

        {/* Bouton suivant */}
        {state.showResult && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={next}
            className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-semibold px-10 py-4 rounded-2xl text-xl transition-all duration-300 hover-lift"
          >
            {state.currentTrackIndex + 1 < state.tracks.length ? "Question suivante →" : "Voir le résultat 🏆"}
          </motion.button>
        )}
      </main>
    </LayoutGradient>
  )
}