"use client"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import Navbar from "@/components/Navbar"
import LayoutGradient from "@/components/LayoutGradient"
import { api } from "@/lib/api"

interface UserProfile {
  display_name: string
  email: string
  image?: string
  total_games: number
  best_score: number
  total_time_played: number
}

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .getProfile()
      .then((u) => {
        if (!u) router.push("/menu")
        else setProfile(u)
      })
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-gray-700">Chargement du profil…</p>
        </div>
      </LayoutGradient>
    )
  }

  if (!profile) {
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex items-center justify-center min-h-screen text-gray-700">Profil indisponible.</div>
      </LayoutGradient>
    )
  }

  return (
    <LayoutGradient>
      <Navbar />
      <main className="flex flex-col items-center px-6 pt-24 pb-16">
        <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-3xl bg-white/80 rounded-2xl border-2 border-purple-200 shadow p-8">
          <div className="flex flex-col items-center text-center mb-10">
            <div className="w-32 h-32 rounded-full border-4 border-purple-500 overflow-hidden bg-gradient-to-br from-purple-600 to-pink-600 grid place-items-center text-4xl text-white font-bold">
              {profile.image ? <img src={profile.image} alt="Profile" className="w-full h-full object-cover" /> : profile.display_name?.[0]?.toUpperCase()}
            </div>
            <h1 className="text-4xl font-bold mt-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{profile.display_name}</h1>
            <p className="text-gray-600">{profile.email}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-6 text-center">
              <p className="text-3xl font-bold text-purple-600">{profile.total_games}</p>
              <p className="text-gray-700 mt-1">Parties jouées</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-pink-200 rounded-xl p-6 text-center">
              <p className="text-3xl font-bold text-pink-600">{profile.best_score}</p>
              <p className="text-gray-700 mt-1">Meilleur score</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-6 text-center">
              <p className="text-3xl font-bold text-purple-600">{profile.total_time_played}h</p>
              <p className="text-gray-700 mt-1">Temps joué</p>
            </div>
          </div>

          <div className="text-center">
            <button onClick={() => router.push("/settings")} className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-xl font-semibold shadow hover:shadow-lg">
              Paramètres
            </button>
          </div>
        </motion.div>
      </main>
    </LayoutGradient>
  )
}
