"use client"

import PageHeader from "@/components/ui/PageHeader"
import SectionCard from "@/components/ui/SectionCard"
import { motion } from "framer-motion"

const mockHistory = [
  { date: "31 Oct 2025", score: 820, mode: "Solo" },
  { date: "30 Oct 2025", score: 1040, mode: "Multijoueur" },
  { date: "28 Oct 2025", score: 760, mode: "Solo" },
]

export default function HistoryPage() {
  return (
    <main className="page-container space-y-8">
      <PageHeader title="Historique" subtitle="Tes dernières parties" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-4"
      >
        {mockHistory.map((item, i) => (
          <SectionCard key={i}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold">{item.date}</h3>
                <p className="text-sm text-muted-foreground">{item.mode}</p>
              </div>
              <div className="text-2xl font-bold bg-gradient-to-r from-brand-cyan to-brand-purple bg-clip-text text-transparent">
                {item.score} pts
              </div>
            </div>
          </SectionCard>
        ))}
      </motion.div>
    </main>
  )
}
