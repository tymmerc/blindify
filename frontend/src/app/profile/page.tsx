"use client"
import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Navbar from "@/components/Navbar"
import { api } from "@/lib/api"
import { PageTransition } from "@/lib/page-transition"
import { BADGES } from "@/lib/badges"

interface UserProfile {
  display_name: string
  email: string
  profile_image?: string
  total_games: number
  best_score: number
  total_time_played: number
}

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const badges = BADGES

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const authCheck = await api.checkAuth()
        if (!authCheck) {
          router.push("/menu")
          return
        }

        // TODO: Fetch user profile from backend
        // For now, using mock data
        setProfile({
          display_name: "Utilisateur Spotify",
          email: "user@spotify.com",
          total_games: 0,
          best_score: 0,
          total_time_played: 0,
        })
      } catch (error) {
        console.error("[v0] Profile load error:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [router])

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100 dark:from-purple-950 dark:via-pink-950 dark:to-purple-900 transition-colors duration-300">
          <p className="text-xl font-semibold">Chargement du profil...</p>
        </div>
      </PageTransition>
    )
  }

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
            className="w-full max-w-4xl"
          >
            <Link
              href="/menu"
              className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-6 font-semibold"
            >
              ← Retour au menu
            </Link>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200 shadow-xl mb-6">
              <div className="text-center p-8">
                <div className="flex flex-col items-center gap-4 mb-4">
                  <div className="w-32 h-32 rounded-full border-4 border-purple-600 bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white text-4xl font-bold">
                    {profile?.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                      {profile?.display_name}
                    </h1>
                    <p className="text-gray-600">{profile?.email}</p>
                  </div>
                </div>
              </div>
              <div className="p-8 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex flex-col items-center p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border-2 border-purple-100">
                    <div className="text-purple-600 mb-3">
                      <MusicIcon />
                    </div>
                    <p className="text-3xl font-bold text-gray-800">{profile?.total_games}</p>
                    <p className="text-gray-600">Parties jouées</p>
                  </div>
                  <div className="flex flex-col items-center p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border-2 border-purple-100">
                    <div className="text-pink-600 mb-3">
                      <TrophyIcon />
                    </div>
                    <p className="text-3xl font-bold text-gray-800">{profile?.best_score}</p>
                    <p className="text-gray-600">Meilleur score</p>
                  </div>
                  <div className="flex flex-col items-center p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border-2 border-purple-100">
                    <div className="text-purple-600 mb-3">
                      <ClockIcon />
                    </div>
                    <p className="text-3xl font-bold text-gray-800">{profile?.total_time_played}h</p>
                    <p className="text-gray-600">Temps de jeu</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200 shadow-xl mb-6 p-8">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-6">
                Badges
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {badges.map((badge) => (
                  <motion.div
                    key={badge.id}
                    whileHover={{ scale: 1.05 }}
                    className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-300 ${
                      badge.unlocked
                        ? "bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300"
                        : "bg-gray-100 border-gray-300 opacity-50"
                    }`}
                  >
                    <div className="text-4xl mb-2">{badge.icon}</div>
                    <p className="text-sm font-semibold text-center text-gray-800">{badge.name}</p>
                    <p className="text-xs text-center text-gray-600 mt-1">{badge.description}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={() => router.push("/settings")}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3 rounded-xl text-lg transition-all duration-300"
              >
                Modifier le profil
              </button>
            </div>
          </motion.div>
        </div>
      </main>
    </PageTransition>
  )
}

const MusicIcon = () => (
  <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
)

const TrophyIcon = () => (
  <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
)

const ClockIcon = () => (
  <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)
