"use client"

import Link from "next/link"
import { motion } from "framer-motion"

export default function Hero() {
  return (
    <section className="relative pt-28 pb-20">
      <div className="container mx-auto px-6 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center"
        >
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
              Blindify
            </span>{" "}
            — le blindtest Spotify
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Joue en solo ou en multijoueur, hôte des parties façon Kahoot, et profite d’animations fluides.
          </p>

          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/menu"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold
                         text-white bg-gradient-to-r from-cyan-500 to-purple-600 shadow-lg hover:opacity-95
                         transition focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              Jouer maintenant
            </Link>
            <Link
              href="/game"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold
                         border border-white/15 text-foreground hover:bg-white/5 transition"
            >
              Voir l’interface de jeu
            </Link>
          </div>

          <div className="mt-10 text-sm text-muted-foreground">
            <span>10 titres par manche • anti-répétition (blacklist) • score à la vitesse</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
