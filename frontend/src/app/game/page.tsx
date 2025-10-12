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
    if (state.timeLeft <= 0) return handleAnswer(null)
    const t = setTimeout(() => {
      setState((p) => ({ ...p, timeLeft: p.timeLeft - 1 }))
      if (state.timeLeft <= 3) playSound("tick")
    }, 1000)
    return () => clearTimeout(t)
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
  }, [state.currentTrackIndex, state.tracks])

  useEffect(() => {
    if (state.tracks.length === 0) return
    const current = state.tracks[state.currentTrackIndex]
    const wrong = state.tracks.filter((t) => t.id !== current.id).sort(() => Math.random() - 0.5).slice(0, 3).map((t) => t.title)
    setOptions([...wrong, current.title].sort(() => Math.random() - 0.5))
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
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-4 border-purple-300 shadow-2xl p-10 text-center max-w-xl w-full">
            <h1 className="text-4xl font-bold mb-6 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Choisis ta difficulté
            </h1>
            <div className="space-y-4">
              <button onClick={() => start("easy")} className="w-full py-4 text-xl font-bold rounded-xl bg-green-500 hover:bg-green-600 text-white">
                Facile — 15 s
              </button>
              <button onClick={() => start("normal")} className="w-full py-4 text-xl font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white">
                Normal — 10 s
              </button>
              <button onClick={() => start("hard")} className="w-full py-4 text-xl font-bold rounded-xl bg-red-500 hover:bg-red-600 text-white">
                Difficile — 5 s
              </button>
            </div>
            <button onClick={() => router.push("/menu")} className="w-full mt-6 border-2 border-purple-600 text-purple-600 hover:bg-purple-50 font-semibold py-3 rounded-xl">
              Retour au menu
            </button>
          </div>
        </div>
      </LayoutGradient>
    )

  if (loading)
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xl text-gray-700">Chargement de la partie…</p>
        </div>
      </LayoutGradient>
    )

  if (state.gameOver)
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="text-center bg-white/80 backdrop-blur-sm rounded-2xl border-4 border-purple-300 shadow-2xl p-10">
            <h1 className="text-5xl font-bold mb-5 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Partie terminée
            </h1>
            <p className="text-3xl font-bold text-gray-800 mb-6">
              Score : {state.score} / {state.tracks.length}
            </p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => router.push("/game")} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3 rounded-xl">
                Rejouer
              </button>
              <button onClick={() => router.push("/menu")} className="border-2 border-purple-600 text-purple-600 hover:bg-purple-50 font-semibold px-8 py-3 rounded-xl">
                Menu
              </button>
            </div>
          </div>
        </div>
      </LayoutGradient>
    )

  const track = state.tracks[state.currentTrackIndex]

  return (
    <LayoutGradient>
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-12 max-w-5xl mx-auto w-full">
        <div className="flex justify-between items-center w-full mb-6">
          <div className="text-2xl font-bold text-gray-800">
            Question {state.currentTrackIndex + 1} / {state.tracks.length}
          </div>
          <div className="text-2xl font-bold text-pink-600">Score : {state.score}</div>
        </div>

        <div className="w-full mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-lg font-semibold text-gray-800">Temps restant</span>
            <span className="text-2xl font-bold text-purple-700">{state.timeLeft}s</span>
          </div>
          <div className="w-full h-3 bg-white rounded-full overflow-hidden border-2 border-purple-200">
            <motion.div className="h-full bg-gradient-to-r from-purple-600 to-pink-600" initial={{ width: "100%" }} animate={{ width: `${(state.timeLeft / 10) * 100}%` }} transition={{ duration: 0.25 }} />
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-4 border-purple-200 shadow p-6 mb-8 w-full">
          <div className="flex items-center gap-6">
            <button onClick={toggle} className="w-20 h-20 rounded-full bg-purple-600 hover:bg-purple-700 text-white grid place-items-center text-3xl">
              {state.isPlaying ? "❚❚" : "▶"}
            </button>
            <div>
              <p className="text-2xl font-bold text-gray-800 mb-1">Quel est ce titre ?</p>
              <p className="text-gray-600">Écoute et choisis la bonne réponse.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-6">
          <AnimatePresence>
            {options.map((opt, i) => {
              const selected = state.selectedAnswer === opt
              const correct = opt === track.title
              const showCorrect = state.showResult && correct
              const showWrong = state.showResult && selected && !correct
              return (
                <motion.button
                  key={opt}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  disabled={state.showResult}
                  onClick={() => !state.showResult && handleAnswer(opt)}
                  className={`w-full h-16 text-lg font-semibold rounded-xl transition-all border-2 ${
                    showCorrect
                      ? "bg-green-500 text-white border-green-600"
                      : showWrong
                      ? "bg-red-500 text-white border-red-600"
                      : "bg-white hover:bg-purple-50 text-gray-800 border-purple-200 hover:border-purple-400"
                  }`}
                >
                  {opt}
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>

        {state.showResult && (
          <motion.button onClick={next} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-10 py-3 rounded-xl text-xl">
            {state.currentTrackIndex + 1 < state.tracks.length ? "Question suivante →" : "Voir le résultat"}
          </motion.button>
        )}
      </main>
    </LayoutGradient>
  )
}
