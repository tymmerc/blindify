"use client"
import { motion } from "framer-motion"
import Link from "next/link"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import api from "@/lib/api"
import Navbar from "@/components/Navbar"

function MenuContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const searchParams = useSearchParams()

  useEffect(() => {
    const access_token = searchParams.get("access_token")
    const refresh_token = searchParams.get("refresh_token")

    if (access_token && refresh_token) {
      localStorage.setItem("spotify_access_token", access_token)
      localStorage.setItem("spotify_refresh_token", refresh_token)
      console.log("[v0] Tokens stored in localStorage")
      window.history.replaceState({}, "", "/menu")
    }

    api.checkAuth().then((data: { authenticated: boolean } | null) => {
      setIsAuthenticated(!!data?.authenticated)
      setIsLoading(false)
    })
  }, [searchParams])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100">
        <div className="text-2xl font-bold text-gray-800">Chargement...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-950 via-pink-950 to-purple-900 px-4">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <h1 className="text-6xl md:text-8xl font-bold mb-8 bg-gradient-to-r from-purple-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">
            Blindify
          </h1>
          <p className="text-xl text-white mb-8">Connecte-toi avec Spotify pour commencer</p>
          <a
            href={api.getLoginUrl()}
            className="inline-block px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-lg rounded-full hover:shadow-2xl transition-all duration-300"
          >
            Se connecter avec Spotify
          </a>
        </motion.div>
      </div>
    )
  }

  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-0 w-1/3 h-full bg-gradient-to-br from-purple-500 to-pink-500 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-1/3 h-full bg-gradient-to-tl from-pink-500 to-purple-500 blur-3xl" />
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 text-9xl text-purple-300/20 font-bold">♪</div>
        <div className="absolute top-40 right-20 text-7xl text-pink-300/20 font-bold">♫</div>
        <div className="absolute bottom-40 left-20 text-8xl text-purple-300/20 font-bold">♬</div>
        <div className="absolute bottom-20 right-32 text-6xl text-pink-300/20 font-bold">♩</div>
        <div className="absolute top-1/2 left-1/4 text-5xl text-purple-300/15 font-bold">♪</div>
        <div className="absolute top-1/3 right-1/4 text-6xl text-pink-300/15 font-bold">♫</div>
      </div>

      <Navbar />

      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-32 pb-40 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <h1 className="text-9xl sm:text-[12rem] font-bold mb-2 pb-6 tracking-tight leading-relaxed bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 bg-clip-text text-transparent">
            Blindify
          </h1>

          <p className="text-xl sm:text-2xl text-gray-700 font-medium max-w-2xl mx-auto leading-relaxed">
            Le seul site de blind test où c'est <span className="font-bold text-pink-600">ta musique</span> et celle de
            tes potes
          </p>
        </motion.div>

        <motion.div
          className="flex flex-col sm:flex-row gap-6 justify-center w-full max-w-2xl"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          <Link href="/game" className="flex-1">
            <button
              className="group relative w-full h-20 rounded-2xl text-xl font-semibold
                             bg-white text-pink-600 border-4 border-pink-600
                             shadow-lg hover:shadow-2xl overflow-hidden
                             transition-all duration-300"
            >
              <span className="relative z-10 group-hover:text-white transition-colors duration-500">Solo</span>
              <div
                className="absolute inset-0 bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600 
                            translate-y-full group-hover:translate-y-0 
                            transition-transform duration-500 ease-out"
              />
            </button>
          </Link>

          <Link href="/lobby" className="flex-1">
            <button
              className="group relative w-full h-20 rounded-2xl text-xl font-semibold
                             bg-white text-purple-600 border-4 border-purple-600
                             shadow-lg hover:shadow-2xl overflow-hidden
                             transition-all duration-300"
            >
              <span className="relative z-10 group-hover:text-white transition-colors duration-500">
                Jouer avec des amis
              </span>
              <div
                className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 
                            translate-y-full group-hover:translate-y-0 
                            transition-transform duration-500 ease-out"
              />
            </button>
          </Link>
        </motion.div>
      </div>

      <motion.div
        className="w-full py-10 bg-white/80 backdrop-blur-md border-t border-gray-200
                   flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-12 
                   text-gray-700 text-base sm:text-lg font-medium px-4 relative z-10"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.8 }}
      >
        <span className="flex items-center gap-3">
          <span className="font-bold text-pink-600 text-xl">1.</span> Connecte ton compte Spotify
        </span>
        <span className="flex items-center gap-3">
          <span className="font-bold text-pink-600 text-xl">2.</span> Importe tes titres likés
        </span>
        <span className="flex items-center gap-3">
          <span className="font-bold text-pink-600 text-xl">3.</span> Mélange-les et que le meilleur gagne
        </span>
      </motion.div>
    </main>
  )
}

export default function MenuPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100">
          <div className="text-2xl font-bold text-gray-800">Chargement...</div>
        </div>
      }
    >
      <MenuContent />
    </Suspense>
  )
}
