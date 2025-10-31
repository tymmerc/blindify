"use client"

import { motion } from "framer-motion"
import { Users, Cpu, Zap, Trophy } from "lucide-react"

const items = [
  {
    icon: Users,
    title: "Multijoueur en host",
    desc: "Code de room, réponses sur chaque appareil, scoreboard en live.",
  },
  {
    icon: Cpu,
    title: "IA & sources",
    desc: "Solo sur tes titres likés, mix multi-utilisateurs, sources playlist/top.",
  },
  {
    icon: Zap,
    title: "Rapide & fluide",
    desc: "Sockets temps réel, lecture preview, transitions lisses.",
  },
  {
    icon: Trophy,
    title: "Score intelligent",
    desc: "Temps de réponse, streaks, récap fin de manche.",
  },
]

export default function Features() {
  return (
    <section className="py-16">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <it.icon className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold">{it.title}</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{it.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
