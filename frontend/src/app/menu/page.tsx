"use client"
import { motion } from "framer-motion"
import Link from "next/link"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Navbar from "@/components/Navbar"
import LayoutGradient from "@/components/LayoutGradient"
import api from "@/lib/api"

function MenuContent() {
  const [isAuth, setIsAuth] = useState(false)
  const [loading, setLoading] = useState(true)
  const params = useSearchParams()

  useEffect(() => {
    const access = params.get("access_token")
    const refresh = params.get("refresh_token")
    if (access) localStorage.setItem("spotify_access_token", access)
    if (refresh) localStorage.setItem("spotify_refresh_token", refresh)
    if (access || refresh) window.history.replaceState({}, "", "/menu")

    api.checkAuth().then((u) => {
      setIsAuth(!!u?.authenticated)
      setLoading(false)
    })
  }, [params])

  if (loading) {
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xl font-semibold text-gray-700">Chargement…</p>
        </div>
      </LayoutGradient>
    )
  }

  if (!isAuth) {
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex flex-1 items-center justify-center px-4">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <h1 className="text-7xl font-extrabold mb-6 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 bg-clip-text text-transparent">
              Blindify
            </h1>
            <p className="text-lg text-gray-700 mb-8">Connecte ton compte Spotify pour commencer.</p>
            <a
              href={api.getLoginUrl()}
              className="inline-block px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-lg rounded-xl shadow hover:shadow-lg"
            >
              Se connecter avec Spotify
            </a>
          </motion.div>
        </div>
      </LayoutGradient>
    )
  }

  return (
    <LayoutGradient>
      <Navbar />
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-28">
        <motion.div initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
          <h1 className="text-8xl sm:text-[10rem] font-extrabold bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 bg-clip-text text-transparent">
            Blindify
          </h1>
          <p className="text-xl sm:text-2xl text-gray-700 mt-4">
            Le blind test basé sur <span className="font-bold text-pink-600">ta</span> musique et celle de tes amis.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl grid sm:grid-cols-2 gap-6">
          <Link href="/game" className="group">
            <div className="h-20 rounded-2xl border-4 border-pink-600 bg-white text-pink-600 font-semibold grid place-items-center shadow hover:shadow-xl relative overflow-hidden">
              <span className="relative z-10 group-hover:text-white transition-colors">Solo</span>
              <div className="absolute inset-0 bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600 translate-y-full group-hover:translate-y-0 transition-transform" />
            </div>
          </Link>

        <Link href="/lobby" className="group">
            <div className="h-20 rounded-2xl border-4 border-purple-600 bg-white text-purple-600 font-semibold grid place-items-center shadow hover:shadow-xl relative overflow-hidden">
              <span className="relative z-10 group-hover:text-white transition-colors">Jouer avec des amis</span>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 translate-y-full group-hover:translate-y-0 transition-transform" />
            </div>
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="mt-14 text-gray-700 bg-white/80 backdrop-blur-md border-t border-gray-200 rounded-2xl px-6 py-5">
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 font-medium">
            <span><span className="text-pink-600 font-bold">1.</span> Connecte Spotify</span>
            <span><span className="text-pink-600 font-bold">2.</span> Option : importe tes titres likés</span>
            <span><span className="text-pink-600 font-bold">3.</span> Joue aussitôt</span>
          </div>
        </motion.div>
      </div>
    </LayoutGradient>
  )
}

export default function MenuPage() {
  return (
    <Suspense>
      <MenuContent />
    </Suspense>
  )
}
