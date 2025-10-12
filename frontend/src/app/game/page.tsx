"use client"
import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { PageTransition } from "@/lib/page-transition"
import { useSound } from "@/lib/use-sound"

const MusicIcon = () => (
  <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
)

const PlayIcon = () => (
  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const PauseIcon = () => (
  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
  </svg>
)

const SkipForwardIcon = () => (
  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
  </svg>
)

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
  difficulty: "easy" | "normal" | "hard"
}

export default function GamePage() {
  const router = useRouter()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const preloadRefs = useRef<HTMLAudioElement[]>([])
  const { playSound } = useSound()
  const [gameState, setGameState] = useState<GameState>({
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
  const [options, setOptions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showDifficultySelect, setShowDifficultySelect] = useState(true)

  const getTimeForDifficulty = (difficulty: "easy" | "normal" | "hard") => {
    switch (difficulty) {
      case "easy":
        return 15
      case "normal":
        return 10
      case "hard":
        return 5
      default:
        return 10
    }
  }

  const preloadNextTracks = (startIndex: number) => {
    preloadRefs.current.forEach((audio) => audio?.pause())
    preloadRefs.current = []

    for (let i = 1; i <= 2; i++) {
      const nextIndex = startIndex + i
      if (nextIndex < gameState.tracks.length) {
        const nextTrack = gameState.tracks[nextIndex]
        if (nextTrack?.preview_url) {
          const audio = new Audio(nextTrack.preview_url)
          audio.preload = "auto"
          preloadRefs.current.push(audio)
        }
      }
    }
  }

  const startGameWithDifficulty = async (difficulty: "easy" | "normal" | "hard") => {
    playSound("click")
    try {
      const authCheck = await api.checkAuth()
      if (!authCheck) {
        router.push("/menu")
        return
      }

      const data = await api.startSoloGame(difficulty)
      const initialTime = getTimeForDifficulty(difficulty)
      setGameState((prev) => ({
        ...prev,
        tracks: data.tracks || [],
        difficulty,
        timeLeft: initialTime,
      }))
      setShowDifficultySelect(false)
      setIsLoading(false)

      if (data.tracks && data.tracks.length > 0) {
        preloadNextTracks(0)
      }
    } catch (error) {
      console.error("[v0] Game start error:", error)
      router.push("/settings")
    }
  }

  const handleAnswer = (answer: string | null) => {
    const currentTrack = gameState.tracks[gameState.currentTrackIndex]
    const isCorrect = answer === currentTrack.title

    if (isCorrect) {
      playSound("correct")
    } else {
      playSound("wrong")
    }

    setGameState((prev) => ({
      ...prev,
      selectedAnswer: answer,
      showResult: true,
      score: isCorrect ? prev.score + 1 : prev.score,
    }))

    if (audioRef.current) {
      audioRef.current.pause()
    }
  }

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null

    if (gameState.isPlaying && gameState.timeLeft > 0 && !gameState.showResult) {
      timer = setTimeout(() => {
        setGameState((prev) => ({
          ...prev,
          timeLeft: Math.max(0, prev.timeLeft - 1),
        }))
        if (gameState.timeLeft <= 3 && gameState.timeLeft > 0) {
          playSound("tick")
        }
      }, 1000)
    } else if (gameState.timeLeft === 0 && !gameState.showResult) {
      handleAnswer(null)
    }

    return () => {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [gameState.isPlaying, gameState.timeLeft, gameState.showResult, playSound, handleAnswer])


  useEffect(() => {
    if (gameState.tracks.length === 0) return

    const currentTrack = gameState.tracks[gameState.currentTrackIndex]
    if (!currentTrack?.preview_url) return

    if (audioRef.current) {
      audioRef.current.pause()
    }

    audioRef.current = new Audio(currentTrack.preview_url)
    audioRef.current.play()
    setGameState((prev) => ({ ...prev, isPlaying: true }))

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [gameState.currentTrackIndex, gameState.tracks])

  const handleNext = () => {
    const nextIndex = gameState.currentTrackIndex + 1

    if (nextIndex >= gameState.tracks.length) {
      playSound("gameOver")
      const trackIds = gameState.tracks.map((t) => t.id)
      api.markTracksAsPlayed(trackIds).catch((error: unknown) => {
        console.error("[v0] Failed to mark tracks as played:", error)
      })
      setGameState((prev) => ({ ...prev, gameOver: true }))
    } else {
      preloadNextTracks(nextIndex)
      const initialTime = getTimeForDifficulty(gameState.difficulty)
      setGameState((prev) => ({
        ...prev,
        currentTrackIndex: nextIndex,
        timeLeft: initialTime,
        selectedAnswer: null,
        showResult: false,
      }))
    }
  }

  useEffect(() => {
    if (gameState.tracks.length === 0) return

    const currentTrack = gameState.tracks[gameState.currentTrackIndex]
    if (!currentTrack) return

    const wrongAnswers = gameState.tracks
      .filter((t) => t.id !== currentTrack.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((t) => t.title)

    const allOptions = [...wrongAnswers, currentTrack.title].sort(() => Math.random() - 0.5)
    setOptions(allOptions)
  }, [gameState.currentTrackIndex, gameState.tracks])

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (gameState.isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setGameState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))
    }
  }

  if (showDifficultySelect) {
    return (
      <PageTransition>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100 dark:from-purple-950 dark:via-pink-950 dark:to-purple-900 px-4 transition-colors duration-300">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl"
          >
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-4 border-purple-300 shadow-2xl p-12">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-4 text-center">
                Choisis ta difficulté
              </h1>
              <p className="text-xl text-gray-600 mb-12 text-center">Sélectionne le niveau de challenge</p>

              <div className="space-y-4">
                <button
                  onClick={() => startGameWithDifficulty("easy")}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-6 px-8 rounded-xl text-2xl transition-all duration-300 transform hover:scale-105"
                >
                  Facile - 15 secondes
                </button>
                <button
                  onClick={() => startGameWithDifficulty("normal")}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-6 px-8 rounded-xl text-2xl transition-all duration-300 transform hover:scale-105"
                >
                  Normal - 10 secondes
                </button>
                <button
                  onClick={() => startGameWithDifficulty("hard")}
                  className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-6 px-8 rounded-xl text-2xl transition-all duration-300 transform hover:scale-105"
                >
                  Difficile - 5 secondes
                </button>
              </div>

              <button
                onClick={() => router.push("/menu")}
                className="w-full mt-8 border-2 border-purple-600 text-purple-600 hover:bg-purple-50 font-semibold py-3 px-8 rounded-xl text-lg transition-all duration-300"
              >
                Retour au menu
              </button>
            </div>
          </motion.div>
        </div>
      </PageTransition>
    )
  }

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100 dark:from-purple-950 dark:via-pink-950 dark:to-purple-900 transition-colors duration-300">
          <div className="text-center">
            <div className="text-purple-600 animate-bounce mx-auto mb-4">
              <MusicIcon />
            </div>
            <p className="text-xl font-semibold text-gray-800">Chargement de la partie...</p>
          </div>
        </div>
      </PageTransition>
    )
  }

  if (gameState.gameOver) {
    return (
      <PageTransition>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100 dark:from-purple-950 dark:via-pink-950 dark:to-purple-900 px-4 transition-colors duration-300">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-4 border-purple-300 shadow-2xl p-12">
              <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-6">
                Partie terminée !
              </h1>
              <p className="text-4xl font-bold text-gray-800 mb-8">
                Score : {gameState.score} / {gameState.tracks.length}
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => router.push("/game")}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3 rounded-xl text-lg transition-all duration-300"
                >
                  Rejouer
                </button>
                <button
                  onClick={() => router.push("/menu")}
                  className="border-2 border-purple-600 text-purple-600 hover:bg-purple-50 font-semibold px-8 py-3 rounded-xl text-lg transition-all duration-300"
                >
                  Menu
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </PageTransition>
    )
  }

  const currentTrack = gameState.tracks[gameState.currentTrackIndex]

  return (
    <PageTransition>
      <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100 dark:from-purple-950 dark:via-pink-950 dark:to-purple-900 px-4 py-8 transition-colors duration-300">
        <div className="w-full max-w-4xl">
          <div className="flex justify-between items-center mb-8">
            <div className="text-2xl font-bold text-foreground">
              Question {gameState.currentTrackIndex + 1} / {gameState.tracks.length}
            </div>
            <div className="text-2xl font-bold text-primary">Score : {gameState.score}</div>
          </div>

          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <span className="text-lg font-semibold text-foreground">Temps restant</span>
              <span className="text-3xl font-bold text-primary">{gameState.timeLeft}s</span>
            </div>
            <div className="w-full h-4 bg-white rounded-full overflow-hidden border-2 border-primary/20">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-secondary"
                initial={{ width: "100%" }}
                animate={{ width: `${(gameState.timeLeft / 10) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-4 border-purple-200 shadow-xl p-8 mb-8">
            <div className="flex items-center gap-6">
              <button
                onClick={togglePlayPause}
                className="w-20 h-20 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition-all duration-300"
              >
                {gameState.isPlaying ? (
                  <PauseIcon />
                ) : (
                  <div className="ml-1">
                    <PlayIcon />
                  </div>
                )}
              </button>
              <div className="flex-1">
                <p className="text-2xl font-bold text-gray-800 mb-2">Quel est ce titre ?</p>
                <p className="text-lg text-gray-600">Écoute attentivement et choisis la bonne réponse</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <AnimatePresence>
              {options.map((option, index) => {
                const isSelected = gameState.selectedAnswer === option
                const isCorrect = option === currentTrack.title
                const showCorrect = gameState.showResult && isCorrect
                const showWrong = gameState.showResult && isSelected && !isCorrect

                return (
                  <motion.div
                    key={option}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <button
                      onClick={() => !gameState.showResult && handleAnswer(option)}
                      disabled={gameState.showResult}
                      className={`w-full h-20 text-lg font-semibold rounded-xl transition-all duration-300
                        ${showCorrect ? "bg-green-500 hover:bg-green-500 text-white border-4 border-green-600" : ""}
                        ${showWrong ? "bg-red-500 hover:bg-red-500 text-white border-4 border-red-600" : ""}
                        ${!gameState.showResult ? "bg-white hover:bg-purple-50 text-gray-800 border-2 border-purple-200 hover:border-purple-400" : ""}
                        ${gameState.showResult && !showCorrect && !showWrong ? "opacity-50" : ""}
                      `}
                    >
                      {option}
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

          {gameState.showResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <button
                onClick={handleNext}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-12 py-3 rounded-xl text-xl transition-all duration-300 flex items-center gap-2 mx-auto"
              >
                {gameState.currentTrackIndex + 1 < gameState.tracks.length ? (
                  <>
                    Question suivante <SkipForwardIcon />
                  </>
                ) : (
                  "Voir les résultats"
                )}
              </button>
            </motion.div>
          )}
        </div>
      </main>
    </PageTransition>
  )
}
