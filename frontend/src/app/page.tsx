"use client"

import { Music, Play, Users, Zap, Trophy, ArrowRight, Sparkles, CheckCircle } from "lucide-react"
import Link from "next/link"
import { motion } from "framer-motion"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Navigation Fixed */}
      <nav className="fixed top-0 w-full bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-green-500 flex items-center justify-center shadow-lg">
              <Music className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-green-500 bg-clip-text text-transparent">
              Blindify
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <Link href="#features" className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-purple-600 transition">
              Fonctionnalités
            </Link>
            <Link href="#pricing" className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-purple-600 transition">
              Tarifs
            </Link>
            <Link
              href="/menu"
              className="px-5 py-2 rounded-full bg-gradient-to-r from-purple-600 to-green-500 text-white font-semibold hover:shadow-lg hover:scale-105 transition-all"
            >
              Jouer maintenant
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 px-6 overflow-hidden bg-white dark:bg-gray-950">
        {/* Background gradients */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-green-500/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
        
        <div className="max-w-7xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left - Text */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-8"
            >
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                  #1 Plateforme de blindtest Spotify
                </span>
              </div>

              {/* Title */}
              <div className="space-y-4">
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-black leading-tight text-gray-900 dark:text-white">
                  Le blindtest
                  <br />
                  <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-green-500 bg-clip-text text-transparent">
                    réinventé
                  </span>
                </h1>
                <p className="text-xl text-gray-600 dark:text-gray-400 max-w-xl">
                  Connecte Spotify, défie tes amis et prouve que tu as la meilleure culture musicale. 
                  Gratuit, rapide, addictif.
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/menu"
                  className="group px-8 py-4 rounded-full bg-gradient-to-r from-purple-600 to-green-500 text-white font-bold text-lg flex items-center justify-center gap-2 hover:shadow-2xl hover:shadow-purple-500/50 hover:scale-105 transition-all"
                >
                  <Play className="w-5 h-5" />
                  Commencer gratuitement
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <button className="px-8 py-4 rounded-full border-2 border-gray-300 dark:border-gray-700 font-semibold text-lg text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-900 transition">
                  Voir la démo
                </button>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-8 pt-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">50K+</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Joueurs actifs</p>
                  </div>
                </div>
                <div className="h-10 w-px bg-gray-200 dark:bg-gray-800" />
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">2M+</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Titres découverts</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right - Demo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl shadow-purple-500/10 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-green-500 flex items-center justify-center">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Blindtest en cours</p>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Années 2000</h3>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-gray-100 dark:bg-gray-800">
                    <p className="text-xs uppercase text-gray-500 mb-2">Extrait en lecture</p>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-purple-200 dark:bg-purple-900/30 flex items-center justify-center">
                        <Music className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">Devine le titre !</p>
                        <p className="text-sm text-gray-500">15 secondes restantes</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                    <p className="text-xs uppercase text-gray-500 mb-3">Réponses</p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-600">
                        <Music className="w-5 h-5 text-purple-600" />
                        <span className="font-semibold text-gray-900 dark:text-white">Artiste - Titre</span>
                        <CheckCircle className="w-5 h-5 text-green-500 ml-auto" />
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-800">
                        <Music className="w-5 h-5 text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-400">Artiste - Titre</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-800">
                        <Music className="w-5 h-5 text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-400">Artiste - Titre</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
                      <div>
                        <p className="text-sm text-gray-500">Score</p>
                        <p className="text-2xl font-bold text-purple-600">850</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Temps</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">2:34</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Combo</p>
                        <p className="text-2xl font-bold text-green-500">x3</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating elements */}
                <div className="absolute -top-6 -right-6 w-20 h-20 bg-purple-600 rounded-2xl flex items-center justify-center shadow-xl animate-bounce">
                  <Music className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -bottom-6 -left-6 w-16 h-16 bg-green-500 rounded-xl flex items-center justify-center shadow-xl">
                  <Play className="w-8 h-8 text-white" />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-gray-50 dark:bg-gray-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">
              Pourquoi choisir <span className="text-purple-600">Blindify</span> ?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              La plateforme la plus complète pour des blindtests épiques entre amis
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="group p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-xl transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Music className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Synchronisé à Spotify
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nous récupérons automatiquement tes titres likés, top tracks et playlists privées pour créer des parties ultra personnalisées.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="group p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-pink-600 hover:shadow-xl transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-pink-100 dark:bg-pink-900/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8 text-pink-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Ready for party
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Crée des rooms en un clic, invite tes amis et lance des blindtests synchronisés, en direct ou à distance.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="group p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-green-600 hover:shadow-xl transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-green-100 dark:bg-green-900/20 flex items center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Trophy className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Classements & stats
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Historique des parties, statistiques détaillées, progression et badges à collectionner.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">
              Gratuit, et ça le restera.
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Blindify est open source et restera gratuit pour les joueurs. Soutiens le projet si tu veux accélérer la roadmap.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="p-8 rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-xl transition-all"
            >
              <p className="text-sm font-medium text-purple-600">Solo</p>
              <h3 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">0€</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Accès complet au mode solo avec tes titres likés.</p>
              <ul className="mt-6 space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <li>✅ Blindtest instantané</li>
                <li>✅ Blacklist auto des morceaux joués</li>
                <li>✅ Like depuis la partie</li>
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="relative p-8 rounded-3xl border-2 border-purple-500 bg-gradient-to-br from-purple-600 via-pink-500 to-green-500 text-white shadow-xl"
            >
              <span className="absolute -top-3 left-8 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest">Bientôt</span>
              <p className="text-sm font-medium">Multijoueur</p>
              <h3 className="mt-4 text-3xl font-bold">3,99€ / session</h3>
              <p className="mt-2 text-sm text-white/80">Héberge une room, invite tes amis et garde la main sur la playlist.</p>
              <ul className="mt-6 space-y-3 text-sm text-white/90">
                <li>✅ Invitations instantanées</li>
                <li>✅ Classement temps réel</li>
                <li>✅ Playlist collaborative</li>
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="p-8 rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-xl transition-all"
            >
              <p className="text-sm font-medium text-green-600">Clubs & bars</p>
              <h3 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">Sur devis</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Blindtest conçu pour les soirées avec scoreboard sur écran.</p>
              <ul className="mt-6 space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <li>✅ Marque personnalisée</li>
                <li>✅ Mode host avec tablette</li>
                <li>✅ Statistiques avancées</li>
              </ul>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  )
}
