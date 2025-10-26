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
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xl font-semibold text-gray-400">Chargement…</p>
          </motion.div>
        </div>
      </LayoutGradient>
    )
  }

  if (!isAuth) {
    return (
      <LayoutGradient>
        <Navbar />
        <div className="flex flex-1 items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center max-w-2xl"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
              className="mb-8"
            >
              <h1 className="text-7xl md:text-8xl font-extrabold text-gradient mb-4 tracking-tight">
                Blindify
              </h1>
              <div className="h-1 w-32 mx-auto bg-gradient-to-r from-transparent via-indigo-500 to-transparent rounded-full" />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-xl text-gray-400 mb-12 leading-relaxed"
            >
              Connecte ton compte Spotify et teste tes connaissances musicales
              <br />
              <span className="text-indigo-400 font-semibold">de manière interactive et amusante</span>
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <a
                href={api.getLoginUrl()}
                className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg text-white overflow-hidden hover-lift"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-500 animate-gradient" />
                <span className="relative z-10 text-2xl">🎧</span>
                <span className="relative z-10">Se connecter avec Spotify</span>
                <motion.span
                  className="relative z-10 text-xl"
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  →
                </motion.span>
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-12 flex items-center justify-center gap-8 text-sm text-gray-500"
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-glow" />
                Sécurisé
              </span>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-glow" />
                Gratuit
              </span>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-glow" />
                Instantané
              </span>
            </motion.div>
          </motion.div>
        </div>
      </LayoutGradient>
    )
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  }

  return (
    <LayoutGradient>
      <Navbar />
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-16">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="text-center mb-16"
        >
          <motion.h1
            variants={itemVariants}
            className="text-7xl md:text-9xl font-extrabold text-gradient mb-6 tracking-tight"
          >
            Blindify
          </motion.h1>
          <motion.p variants={itemVariants} className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Le blind test nouvelle génération basé sur{" "}
            <span className="text-gradient-accent font-bold">ta</span> musique
            <br />
            et celle de tes amis
          </motion.p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-2xl grid md:grid-cols-2 gap-6 mb-12"
        >
          <motion.div variants={itemVariants}>
            <Link href="/game" className="group block">
              <div className="relative h-36 rounded-2xl overflow-hidden glass-strong hover-lift">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 group-hover:from-indigo-500/20 group-hover:to-purple-500/20 transition-all duration-500" />
                <div className="relative z-10 h-full flex flex-col items-center justify-center gap-3">
                  <span className="text-5xl group-hover:scale-110 transition-transform duration-300">🎧</span>
                  <span className="text-2xl font-bold text-white">Solo</span>
                  <span className="text-sm text-gray-400">Joue seul et améliore ton score</span>
                </div>
                <div className="absolute inset-0 border border-white/10 rounded-2xl group-hover:border-indigo-500/30 transition-all duration-500" />
              </div>
            </Link>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Link href="/lobby" className="group block">
              <div className="relative h-36 rounded-2xl overflow-hidden glass-strong hover-lift">
                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 to-cyan-500/10 group-hover:from-teal-500/20 group-hover:to-cyan-500/20 transition-all duration-500" />
                <div className="relative z-10 h-full flex flex-col items-center justify-center gap-3">
                  <span className="text-5xl group-hover:scale-110 transition-transform duration-300">👥</span>
                  <span className="text-2xl font-bold text-white">Multijoueur</span>
                  <span className="text-sm text-gray-400">Défie tes amis en temps réel</span>
                </div>
                <div className="absolute inset-0 border border-white/10 rounded-2xl group-hover:border-teal-500/30 transition-all duration-500" />
              </div>
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="glass rounded-2xl px-8 py-6 max-w-4xl"
        >
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">
            <div className="flex items-center gap-3 text-gray-300">
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-lg">
                1
              </div>
              <span className="font-medium">Connecte Spotify</span>
            </div>
            <div className="hidden md:block h-px w-12 bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
            <div className="flex items-center gap-3 text-gray-300">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-lg">
                2
              </div>
              <span className="font-medium">Importe tes titres</span>
            </div>
            <div className="hidden md:block h-px w-12 bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
            <div className="flex items-center gap-3 text-gray-300">
              <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-lg">
                3
              </div>
              <span className="font-medium">Melange les avec ceux de tes amis et que le meilleur gagne !</span>
            </div>
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