"use client"

import Link from "next/link"
import { User } from "lucide-react"
import { ACCOUNT_PATH } from "@/components/account/GoToAccount"

// Point d'entree « Mon compte », en haut a droite de la page des modes.
// Depuis le 05/11/2026, un seul ecran (pseudo, parties, musique, donnees) :
// le rond y mene tout droit, plus de menu a quatre lignes.
export function AccountMenu() {
  return (
    <div className="fixed right-5 top-6 z-40 sm:right-8 sm:top-8">
      <Link
        href={ACCOUNT_PATH}
        aria-label="Mon compte"
        title="Mon compte"
        // Discret (Tym, 05/11) : meme gabarit que le « ? » de la FAQ sur /jouer/.
        className="grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-line bg-paper-deep text-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition hover:bg-ink-block hover:text-on-ink"
      >
        <User className="h-4 w-4" />
      </Link>
    </div>
  )
}
