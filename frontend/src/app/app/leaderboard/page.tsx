"use client"

import PageHeader from "@/components/ui/PageHeader"
import SectionCard from "@/components/ui/SectionCard"
import { motion } from "framer-motion"

const players = [
  { name: "Tyméo", score: 1240 },
  { name: "Lisandru", score: 1170 },
  { name: "Charles", score: 1090 },
  { name: "Kevin", score: 970 },
]

export default function LeaderboardPage() {
  return (
    <main className="page-container space-y-8">
      <PageHeader title="Leaderboard" subtitle="Classement général" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="space-y-4"
      >
        {players.map((p, i) => (
          <SectionCard key={i}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-lg font-bold text-brand-cyan">#{i + 1}</div>
                <div className="font-semibold">{p.name}</div>
              </div>
              <div className="text-xl font-bold bg-gradient-to-r from-brand-cyan to-brand-purple bg-clip-text text-transparent">
                {p.score} pts
              </div>
            </div>
          </SectionCard>
        ))}
      </motion.div>
    </main>
  )
}
