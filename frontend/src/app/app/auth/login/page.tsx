"use client"

import { Music, Play, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { api } from "@/lib/api"

export default function AuthLoginPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Vérifier si déjà connecté
    const checkAuth = async () => {
      const user = await api.checkAuth()
      if (user) {
        // Déjà connecté, rediriger vers le menu
        router.push("/app/menu")
      } else {
        setChecking(false)
      }
    }
    checkAuth()
  }, [router])

  const handleLogin = () => {
    window.location.href = "https://blindify-production.up.railway.app/auth/login"
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-600 to-green-500 animate-pulse flex items-center justify-center">
            <Music className="w-10 h-10 text-white" />
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">Vérification...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-12"
        >
          {/* Logo & Title */}
          <div className="space-y-6">
            <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-br from-purple-600 via-pink-500 to-green-500 flex items-center justify-center shadow-2xl">
              <Music className="w-12 h-12 text-white" />
            </div>
            <div>
              <h1 className="text-5xl md:text-7xl font-black text-gray-900 dark:text-white mb-4">
                Bienvenue sur <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent">Blindify</span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
                Le blindtest musical ultime avec tes playlists Spotify
              </p>
            </div>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4 mx-auto">
                <Music className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Tes musiques</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Joue avec tes titres likés et playlists Spotify
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <div className="w-12 h-12 rounded-xl bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center mb-4 mx-auto">
                <Play className="w-6 h-6 text-pink-600" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Solo ou Multi</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Joue seul ou défie jusqu'à 20 amis
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4 mx-auto">
                <Sparkles className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">100% Gratuit</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Aucun abonnement, aucune pub
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="space-y-6">
            <button
              onClick={handleLogin}
              className="group inline-flex items-center gap-3 px-12 py-5 rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 text-white font-bold text-xl hover:shadow-2xl hover:shadow-purple-500/50 hover:scale-105 transition-all"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              Se connecter avec Spotify
              <Play className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gratuit • Aucune installation • En 10 secondes
            </p>
          </div>

          {/* Info */}
          <div className="pt-8 max-w-2xl mx-auto">
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                🔒 <strong>Sécurisé :</strong> Nous utilisons l'authentification officielle Spotify. 
                Nous ne stockons jamais ton mot de passe.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}