"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function UploadPlaceholderPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 text-center">
      <div className="space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Imports locaux</p>
        <h1 className="font-display text-4xl font-semibold text-[#2e2014]">Bientôt disponible</h1>
        <p className="text-sm text-[#6b573f]">
          Vous pourrez bientôt importer vos propres extraits MP3 et créer des manches personnalisées. Cette
          fonctionnalité est en cours de développement, restez connectés !
        </p>
      </div>
      <div className="flex justify-center">
        <Button asChild variant="outline" className="gap-2">
          <Link href="/modes">
            <ArrowLeft className="h-4 w-4" />
            Retour au menu
          </Link>
        </Button>
      </div>
    </main>
  )
}
