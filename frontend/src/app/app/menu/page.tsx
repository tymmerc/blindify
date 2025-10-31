"use client"

import PageHeader from "@/components/ui/PageHeader"
import SectionCard from "@/components/ui/SectionCard"
import ActionButton from "@/components/ui/ActionButton"
import { motion } from "framer-motion"
import Link from "next/link"

export default function MenuPage() {
  return (
    <main className="page-container space-y-10">
      <PageHeader title="Menu principal" subtitle="Choisis ton mode de jeu" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="grid md:grid-cols-2 gap-6"
      >
        <SectionCard>
          <h3 className="text-xl font-semibold">Mode Solo</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Joue avec tes titres likés, choisis la difficulté et découvre des sons oubliés.
          </p>
          <div className="mt-5">
            <Link href="/game">
              <ActionButton>Lancer une partie</ActionButton>
            </Link>
          </div>
        </SectionCard>

        <SectionCard>
          <h3 className="text-xl font-semibold">Mode Multijoueur</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Crée une room, partage le code et affronte tes amis comme sur Kahoot.
          </p>
          <div className="mt-5">
            <Link href="/lobby">
              <ActionButton>Créer une Room</ActionButton>
            </Link>
          </div>
        </SectionCard>
      </motion.div>
    </main>
  )
}
