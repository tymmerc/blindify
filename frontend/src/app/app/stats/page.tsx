"use client"

import PageHeader from "@/components/ui/PageHeader"
import SectionCard from "@/components/ui/SectionCard"
import { motion } from "framer-motion"

export default function StatsPage() {
  return (
    <main className="page-container space-y-8">
      <PageHeader title="Statistiques" subtitle="Tes performances globales" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="grid md:grid-cols-2 gap-6"
      >
        <SectionCard>
          <h3 className="text-lg font-semibold mb-2">Taux de réussite</h3>
          <div className="h-40 flex items-center justify-center text-4xl font-bold bg-gradient-to-r from-brand-cyan to-brand-purple bg-clip-text text-transparent">
            87%
          </div>
        </SectionCard>

        <SectionCard>
          <h3 className="text-lg font-semibold mb-2">Temps moyen de réponse</h3>
          <div className="h-40 flex items-center justify-center text-4xl font-bold bg-gradient-to-r from-brand-cyan to-brand-purple bg-clip-text text-transparent">
            3.4s
          </div>
        </SectionCard>

        <SectionCard>
          <h3 className="text-lg font-semibold mb-2">Parties jouées</h3>
          <div className="h-40 flex items-center justify-center text-4xl font-bold bg-gradient-to-r from-brand-cyan to-brand-purple bg-clip-text text-transparent">
            152
          </div>
        </SectionCard>

        <SectionCard>
          <h3 className="text-lg font-semibold mb-2">Séries de victoires</h3>
          <div className="h-40 flex items-center justify-center text-4xl font-bold bg-gradient-to-r from-brand-cyan to-brand-purple bg-clip-text text-transparent">
            🔥 9
          </div>
        </SectionCard>
      </motion.div>
    </main>
  )
}
