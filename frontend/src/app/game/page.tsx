"use client"
import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import Navbar from "@/components/Navbar"
import LayoutGradient from "@/components/LayoutGradient"
import { api } from "@/lib/api"
import { useSound } from "@/lib/use-sound"

type Difficulty = "easy" | "normal" | "hard"
type Source = "liked" | "playlist" | "top-tracks" | "recently-played" | "ai"

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
  points: number
  timeLeft: number
  isPlaying: boolean
  userAnswer: string
  showResult: boolean
  resultData: { isCorrect: boolean; points: number; similarity: number } | null
  gameOver: boolean
  difficulty: Difficulty
  source: Source
  currentStreak: number
  maxStreak: number
  startTime: number
}

export default function GamePage() {
  const router = useRouter()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { playSound } = useSound()
  const [loading, setLoading] = useState(true)
  const [selectingSource, setSelectingSource] = useState(true)
  const [selectingDifficulty, setSelectingDifficulty] = useState(false)
  const [selectedSource, setSelectedSource] = useState<Source>("liked")
  const [playlists, setPlaylists] = useState<Array<{ name: string; id: string }>>([]);
  const [state, setState] = useState<GameState>({
    sessionId: null,
    tracks: [],
    currentTrackIndex: 0,
    score: 0,
    points: 0,
    timeLeft: 10,
    isPlaying: false,
    userAnswer: "",
    showResult: false,
    resultData: null,
    gameOver: false,
    difficulty: "normal",
    source: "liked",
    currentStreak: 0,
    maxStreak: 0,
    startTime: Date.now()
  })

  const timeFor = (d: Difficulty) => (d === "easy" ? 15 : d === "hard" ? 5 : 10)

  useEffect(() => {
    const checkAuth = async () => {
      const me = await api.checkAuth()
      if (!me) router.push("/menu")
      else setLoading(false)
    }
    checkAuth()
  }, [router])

  const loadPlaylists = async () => {
    try {
      const data = await api.getPlaylists()
      setPlaylists(data.playlists || [])
    } catch {
      setPlaylists([])
    }
  }

  const selectSource = async (source: Source) => {
    setSelectedSource(source)
    if (source === "playlist") {
      await loadPlaylists()
    }
    setSelectingSource(false)
    setSelectingDifficulty(true)
  }

  const start = async (d: Difficulty, sourceId: string | null = null) => {
    setLoading(true)
    try {
      const data = await api.startSoloGame({
        difficulty: d,
        source: selectedSource,
        sourceId,
        count: 20
      })
      setState((prev) => ({ 
        ...prev, 
        sessionId: data.sessionId,
        tracks: data.tracks || [], 
        timeLeft: timeFor(d), 
        difficulty: d,
        source: selectedSource,
        startTime: Date.now()
      }))
      setSelectingDifficulty(false)
      setLoading(false)
    } catch (_err) {
      alert("Erreur lors du chargement de la partie")
      setSelectingSource(true)
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!state.userAnswer.trim() || state.showResult) return

    const current = state.tracks[state.currentTrackIndex]
    const responseTime = Date.now() - state.startTime

    try {
      const result = await api.submitAnswer({
        sessionId: state.sessionId!,
        trackId: current.id,
        userAnswer: state.userAnswer,
        correctAnswer: current.title,
        responseTimeMs: responseTime,
        questionNumber: state.currentTrackIndex + 1
      })

      playSound(result.isCorrect ? "correct" : "wrong")
      
      const newStreak = result.isCorrect ? state.currentStreak + 1 : 0
      
      setState((p) => ({
        ...p,
        showResult: true,
        resultData: result,
        score: result.isCorrect ? p.score + 1 : p.score,
        points: p.points + result.points,
        currentStreak: newStreak,
        maxStreak: Math.max(p.maxStreak, newStreak)
      }))
      
      audioRef.current?.pause()
    } catch (_err) {
      alert("Erreur lors de l'envoi de la réponse")
    }
  }

  const handleSkip = async () => {
    const current = state.tracks[state.currentTrackIndex]
    const responseTime = Date.now() - state.startTime

    try {
      await api.submitAnswer({
        sessionId: state.sessionId!,
        trackId: current.id,
        userAnswer: "",
        correctAnswer: current.title,
        responseTimeMs: responseTime,
        questionNumber: state.currentTrackIndex + 1,
        skipped: true
      })

      setState((p) => ({
        ...p,
        showResult: true,
        resultData: { isCorrect: false, points: 0, similarity: 0 },
        currentStreak: 0
      }))
      
      audioRef.current?.pause()
    } catch (_err) {
      alert("Erreur")
    }
  }

  const likeTrack = async () => {
    const current = state.tracks[state.currentTrackIndex]
    try {
      await api.likeTrack(current.id)
      playSound("correct")
    } catch (_err) {
      console.error("Failed to like track")
    }
  }

  useEffect(() => {
    if (state.showResult || !state.isPlaying) return
    if (state.timeLeft <= 0) {
      handleSkip()
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
    setState((p) => ({ ...p, isPlaying: true, startTime: Date.now() }))
    inputRef.current?.focus()
    return () => audioRef.current?.pause()
  }, [state.currentTrackIndex, state.tracks])

  const next = () => {
    const n = state.currentTrackIndex + 1
    if (n >= state.tracks.length) {
      playSound("gameOver")
      completeGame()
      setState((p) => ({ ...p, gameOver: true }))
      return
    }
    setState((p) => ({
      ...p,
      currentTrackIndex: n,
      timeLeft: timeFor(state.difficulty),
      userAnswer: "",
      showResult: false,
      resultData: null,
      startTime: Date.now()
    }))
  }

  const completeGame = async () => {
    try {
      await api.completeGame(state.sessionId!)
    } catch (err) {
      console.error("Failed to complete game")
    }
  }

  const toggle = () => {
    if (!audioRef.current) return
    if (state.isPlaying) audioRef.current.pause()
    else audioRef.current.play().catch(() => void 0)
    setState((p) => ({ ...p, isPlaying: !p.isPlaying }))
  }

  if (loading && !selectingSource && !selectingDifficulty)
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

  if (selectingSource)
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex flex-1 items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-3xl p-10 text-center max-w-2xl w-full"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="text-6xl mb-6"
            >
              🎵
            </motion.div>
            <h1 className="text-4xl font-bold mb-4 text-gradient">
              Choisis ta source
            </h1>
            <p className="text-gray-400 mb-8">D&apos;où veux-tu que viennent les questions ?</p>
            <div className="space-y-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => selectSource("liked")}
                className="w-full py-4 text-lg font-bold rounded-xl glass hover:glass-strong text-white transition-all duration-300 hover-lift"
              >
                <span className="mr-2">❤️</span> Mes titres likés
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => selectSource("top-tracks")}
                className="w-full py-4 text-lg font-bold rounded-xl glass hover:glass-strong text-white transition-all duration-300 hover-lift"
              >
                <span className="mr-2">🔥</span> Mes top tracks
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => selectSource("recently-played")}
                className="w-full py-4 text-lg font-bold rounded-xl glass hover:glass-strong text-white transition-all duration-300 hover-lift"
              >
                <span className="mr-2">⏱️</span> Récemment écouté
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => selectSource("ai")}
                className="w-full py-4 text-lg font-bold rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white transition-all duration-300 hover-lift"
              >
                <span className="mr-2">🤖</span> Mode IA (Recommandations)
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

  if (selectingDifficulty)
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
              onClick={() => {
                setSelectingDifficulty(false)
                setSelectingSource(true)
              }}
              className="w-full mt-6 glass hover:glass-strong text-gray-300 hover:text-white font-semibold py-3 rounded-xl transition-all duration-300"
            >
              ← Changer la source
            </button>
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
            <div className="mb-8 space-y-4">
              <div>
                <div className="text-6xl font-bold text-white mb-2">
                  {state.score} / {state.tracks.length}
                </div>
                <div className="text-gray-400">
                  {Math.round((state.score / state.tracks.length) * 100)}% de réussite
                </div>
              </div>
              <div className="glass rounded-xl p-4">
                <div className="text-2xl font-bold text-gradient mb-1">{state.points} pts</div>
                <div className="text-sm text-gray-400">Points totaux</div>
              </div>
              <div className="glass rounded-xl p-4">
                <div className="text-2xl font-bold text-orange-400 mb-1">🔥 {state.maxStreak}</div>
                <div className="text-sm text-gray-400">Meilleure série</div>
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
          <div className="glass px-6 py-3 rounded-xl">
            <span className="text-gray-400 text-sm">Points</span>
            <div className="text-2xl font-bold text-gradient">
              {state.points}
            </div>
          </div>
          {state.currentStreak > 0 && (
            <div className="glass px-6 py-3 rounded-xl animate-pulse">
              <div className="text-2xl font-bold text-orange-400">
                🔥 {state.currentStreak}
              </div>
            </div>
          )}
        </div>

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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong rounded-2xl p-8 mb-6 w-full"
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
              <p className="text-gray-400">Tape le nom du morceau</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={likeTrack}
              className="w-14 h-14 rounded-full glass hover:glass-strong text-2xl hover-lift"
            >
              ❤️
            </motion.button>
          </div>
        </motion.div>

        {!state.showResult ? (
          <div className="w-full mb-6 space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative"
            >
              <input
                ref={inputRef}
                type="text"
                value={state.userAnswer}
                onChange={(e) => setState((p) => ({ ...p, userAnswer: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit()
                }}
                placeholder="Entre le nom du morceau..."
                disabled={state.showResult}
                className="w-full px-6 py-5 text-xl font-semibold rounded-2xl glass-strong text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </motion.div>
            <div className="flex gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSubmit}
                disabled={!state.userAnswer.trim()}
                className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold px-8 py-4 rounded-2xl text-xl transition-all duration-300 hover-lift disabled:cursor-not-allowed"
              >
                Valider ✓
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSkip}
                className="px-8 py-4 rounded-2xl glass hover:glass-strong text-gray-300 hover:text-white font-semibold transition-all duration-300"
              >
                Passer →
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="w-full mb-6 space-y-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`rounded-2xl p-8 ${
                state.resultData?.isCorrect
                  ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-2 border-green-500"
                  : "bg-gradient-to-r from-red-500/20 to-orange-500/20 border-2 border-red-500"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <span className="text-5xl">
                    {state.resultData?.isCorrect ? "✓" : "✗"}
                  </span>
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      {state.resultData?.isCorrect ? "Correct !" : "Incorrect"}
                    </h3>
                    {state.resultData?.similarity !== undefined && state.resultData.similarity > 0 && (
                      <p className="text-gray-300">Similarité: {state.resultData.similarity}%</p>
                    )}
                  </div>
                </div>
                {state.resultData?.points !== undefined && state.resultData.points > 0 && (
                  <div className="text-3xl font-bold text-gradient">
                    +{state.resultData.points} pts
                  </div>
                )}
              </div>
              <div className="glass-strong rounded-xl p-4">
                <p className="text-sm text-gray-400 mb-1">Bonne réponse :</p>
                <p className="text-xl font-bold text-white">{track.title}</p>
                <p className="text-gray-300">{track.artist}</p>
              </div>
            </motion.div>
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={next}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-semibold px-10 py-4 rounded-2xl text-xl transition-all duration-300 hover-lift"
            >
              {state.currentTrackIndex + 1 < state.tracks.length ? "Question suivante →" : "Voir le résultat 🏆"}
            </motion.button>
          </div>
        )}
      </main>
    </LayoutGradient>
  )
}