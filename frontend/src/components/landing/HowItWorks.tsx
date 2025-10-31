"use client"

import { motion } from "framer-motion"

const steps = [
  { n: "01", t: "Connecte Spotify", d: "Connexion OAuth — aucun mot de passe stocké côté Blindify." },
  { n: "02", t: "Choisis le mode", d: "Solo (10 titres likés au hasard, blacklist) ou multijoueur (mix des likés)." },
  { n: "03", t: "Réponds vite", d: "Aperçu audio, indices, score basé sur la vitesse et la précision." },
  { n: "04", t: "Récap & partage", d: "Scoreboard de fin de manche, historique et progression." },
]

export default function HowItWorks() {
  return (
    <section className="py-10">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">Comment ça marche</h2>
            <p className="mt-2 text-muted-foreground">
              Blindify tire parti de tes titres likés et des préviews Spotify pour un blindtest sans latence.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {steps.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="text-cyan-400 text-sm font-semibold">{s.n}</div>
                <div className="font-medium">{s.t}</div>
                <div className="text-sm text-muted-foreground">{s.d}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
