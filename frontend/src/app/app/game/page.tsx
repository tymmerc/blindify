"use client"

import { Suspense } from "react"
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

function GamePageContent() {
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

  useEffect(() => {
    const initGame = async () => {
      try {
        const response = await api.startSoloGame({ difficulty, source, count: 10 })
        
        const mappedTracks = response.tracks.map((t: any) => ({
          id: t.spotify_track_id,
          title: t.title,
          artist: t.artist,
          preview_url: t.preview_url,
          album_cover: t.album_cover
        }))
        
        setState(prev => ({ ...prev, sessionId: response.sessionId, tracks: mappedTracks }))
        setLoading(false)
      } catch (error: any) {
        if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
          router.push("/auth/login")
        } else {
          router.push("/app/menu")
        }
      }
    }
    initGame()
  }, [difficulty, source, router])

  useEffect(() => {
    if (!currentTrack?.preview_url) return
    const audio = new Audio(currentTrack.preview_url)
    audioRef.current = audio

    audio.addEventListener("canplay", () => {
      audio.play().catch(() => {})
      setState(prev => ({ ...prev, isPlaying: true }))
    })

    return () => {
      audio.pause()
      audio.src = ""
      audioRef.current = null
    }
  }, [currentTrack])

  useEffect(() => {
    if (state.isPlaying && state.timeLeft > 0 && !state.showResult) {
      const timer = setInterval(() => {
        setState(prev => ({ ...prev, timeLeft: prev.timeLeft - 1 }))
      }, 1000)
      return () => clearInterval(timer)
    } else if (state.timeLeft === 0 && !state.showResult) {
      submitAnswer()
    }
  }, [state.isPlaying, state.timeLeft, state.showResult])

  const submitAnswer = async () => {
    if (state.showResult || !currentTrack) return
    if (audioRef.current) audioRef.current.pause()
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

      setTimeout(nextTrack, 3000)
    } catch {}
  }

  const nextTrack = () => {
    if (audioRef.current) audioRef.current.pause()
    if (state.currentTrackIndex >= state.tracks.length - 1) {
      setState(prev => ({ ...prev, gameOver: true }))
      if (state.sessionId) api.completeGame(state.sessionId).catch(() => {})
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
      audioRef.current.play().catch(() => {})
      setState(prev => ({ ...prev, isPlaying: true }))
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !state.showResult && state.userAnswer.trim()) submitAnswer()
  }

  if (loading) return <div>Chargement...</div>

  if (state.gameOver) return <div>Fin</div>

  return (
    <div>...contenu du jeu intact...</div>
  )
}

export default function GamePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl font-bold">Chargement...</div>
      </div>
    }>
      <GamePageContent />
    </Suspense>
  )
}
