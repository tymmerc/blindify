"use client"

import Link from "next/link"
import { motion } from "framer-motion"

export default function CTA() {
  return (
    <section className="py-16">
      <div className="container mx-auto px-6 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-purple-600/10 p-8 text-center"
        >
          <h3 className="text-2xl md:text-3xl font-bold">Prêt à jouer ?</h3>
          <p className="mt-2 text-muted-foreground">
            Lance une partie solo avec tes titres likés, ou crée un salon multijoueur façon Kahoot.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <Link
              href="/menu"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold
                         text-white bg-gradient-to-r from-cyan-500 to-purple-600 shadow-lg hover:opacity-95
                         transition focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              Démarrer une partie
            </Link>
            <Link
              href="/lobby"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold
                         border border-white/15 text-foreground hover:bg-white/5 transition"
            >
              Hoster un salon
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
