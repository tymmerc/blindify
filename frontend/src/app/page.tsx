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
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">1M+</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Parties jouées</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right - Visual */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="relative w-full max-w-lg mx-auto">
                {/* Card principale */}
                <div className="relative bg-gradient-to-br from-purple-600 to-green-500 p-8 rounded-3xl shadow-2xl">
                  <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-500">En cours</span>
                      <span className="px-3 py-1 rounded-full bg-green-500 text-white text-xs font-bold">LIVE</span>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full w-3/4 bg-gradient-to-r from-purple-600 to-green-500 rounded-full" />
                      </div>
                      
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
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Tes playlists Spotify</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Connecte ton compte et joue avec ta propre musique. Plus de 100M de titres disponibles.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              viewport={{ once: true }}
              className="group p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-xl transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-pink-100 dark:bg-pink-900/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8 text-pink-600" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Multijoueur temps réel</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Défie jusqu'à 20 amis simultanément. Classement en direct, pression maximale.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              viewport={{ once: true }}
              className="group p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-xl transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Gratuit et instantané</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                0€, 0 pub, 0 installation. Clique et joue en 10 secondes chrono.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              viewport={{ once: true }}
              className="group p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-xl transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Trophy className="w-8 h-8 text-yellow-600" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Système de progression</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Niveaux, badges, achievements. Grimpe dans le leaderboard mondial.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              viewport={{ once: true }}
              className="group p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-xl transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Sparkles className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">IA & personnalisation</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Algorithmes qui s'adaptent à ton niveau. Difficulté progressive.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              viewport={{ once: true }}
              className="group p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 hover:shadow-xl transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-indigo-100 dark:bg-indigo-900/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <CheckCircle className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Stats détaillées</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Analyse complète de tes performances. Tracks favorites, artistes, win rate.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-white dark:bg-gray-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">
              Lance une partie en <span className="text-purple-600">30 secondes</span>
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Le processus le plus simple du monde
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: "1", title: "Connecte Spotify", desc: "Un clic, c'est tout" },
              { step: "2", title: "Choisis ta playlist", desc: "Ou laisse l'IA décider" },
              { step: "3", title: "Invite tes amis", desc: "Ou joue en solo" },
              { step: "4", title: "Éclate-toi", desc: "Et prouve ta supériorité" }
            ].map((item, i) => (
              <div key={i} className="relative">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-purple-600 to-green-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                    {item.step}
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">{item.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{item.desc}</p>
                </div>
                {i < 3 && (
                  <div className="hidden md:block absolute top-8 -right-3 text-gray-300 dark:text-gray-700">
                    <ArrowRight className="w-6 h-6" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6 bg-gray-50 dark:bg-gray-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">
              Tarifs <span className="text-purple-600">ultra simples</span>
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Pas de surprise, pas de bullshit
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Plan Gratuit */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
            >
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Gratuit</h3>
                <div className="mb-2">
                  <span className="text-5xl font-black text-gray-900 dark:text-white">0€</span>
                  <span className="text-lg ml-2 text-gray-500">pour toujours</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {["Parties illimitées", "Jusqu'à 4 joueurs", "Playlists Spotify", "Stats basiques"].map((feature, j) => (
                  <li key={j} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-500" />
                    <span className="text-gray-900 dark:text-white">{feature}</span>
                  </li>
                ))}
              </ul>

              <button className="w-full py-4 rounded-full font-bold text-lg bg-gradient-to-r from-purple-600 to-green-500 text-white hover:shadow-lg hover:scale-105 transition-all">
                Commencer
              </button>
            </motion.div>

            {/* Plan Pro */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              viewport={{ once: true }}
              className="relative p-8 rounded-2xl bg-gradient-to-br from-purple-600 to-green-500 text-white scale-105 shadow-2xl"
            >
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-yellow-400 text-black text-sm font-bold">
                LE PLUS POPULAIRE
              </div>
              
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">Pro</h3>
                <div className="mb-2">
                  <span className="text-5xl font-black">4,99€</span>
                  <span className="text-lg ml-2 text-white/80">par mois</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {["Tout du Gratuit", "Jusqu'à 20 joueurs", "Stats avancées", "Badges exclusifs", "Sans pub", "Support prioritaire"].map((feature, j) => (
                  <li key={j} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 flex-shrink-0 text-white" />
                    <span className="text-white">{feature}</span>
                  </li>
                ))}
              </ul>

              <button className="w-full py-4 rounded-full font-bold text-lg bg-white text-purple-600 hover:bg-gray-100 transition-all">
                Essayer 14 jours
              </button>
            </motion.div>

            {/* Plan Team */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              viewport={{ once: true }}
              className="p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
            >
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Team</h3>
                <div className="mb-2">
                  <span className="text-5xl font-black text-gray-900 dark:text-white">29€</span>
                  <span className="text-lg ml-2 text-gray-500">par mois</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {["Tout du Pro", "Team building events", "Branding custom", "Admin dashboard", "Support dédié"].map((feature, j) => (
                  <li key={j} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-500" />
                    <span className="text-gray-900 dark:text-white">{feature}</span>
                  </li>
                ))}
              </ul>

              <button className="w-full py-4 rounded-full font-bold text-lg bg-gradient-to-r from-purple-600 to-green-500 text-white hover:shadow-lg hover:scale-105 transition-all">
                Contacter
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 bg-white dark:bg-gray-950">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-4xl md:text-6xl font-black text-gray-900 dark:text-white">
            Prêt à <span className="text-purple-600">dominer</span> ?
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Rejoins 50 000+ joueurs qui s'affrontent déjà sur Blindify
          </p>
          <Link
            href="/menu"
            className="inline-flex items-center gap-3 px-10 py-5 rounded-full bg-gradient-to-r from-purple-600 to-green-500 text-white font-bold text-xl hover:shadow-2xl hover:shadow-purple-500/50 hover:scale-105 transition-all"
          >
            <Play className="w-6 h-6" />
            Commencer maintenant
            <ArrowRight className="w-6 h-6" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-12 px-6 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-green-500 flex items-center justify-center">
                  <Music className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900 dark:text-white">Blindify</span>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                La plateforme #1 pour des blindtests musicaux entre amis.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-gray-900 dark:text-white">Produit</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><Link href="#" className="hover:text-purple-600 transition">Fonctionnalités</Link></li>
                <li><Link href="#" className="hover:text-purple-600 transition">Tarifs</Link></li>
                <li><Link href="#" className="hover:text-purple-600 transition">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-gray-900 dark:text-white">Légal</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><Link href="#" className="hover:text-purple-600 transition">CGU</Link></li>
                <li><Link href="#" className="hover:text-purple-600 transition">Confidentialité</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-gray-900 dark:text-white">Social</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><Link href="#" className="hover:text-purple-600 transition">Twitter</Link></li>
                <li><Link href="#" className="hover:text-purple-600 transition">Discord</Link></li>
                <li><Link href="#" className="hover:text-purple-600 transition">Instagram</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-600 dark:text-gray-400">
            <p>© 2025 Blindify. Made with ♪ for music lovers.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}