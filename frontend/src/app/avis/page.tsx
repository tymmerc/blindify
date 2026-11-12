import type { Metadata } from "next"
import { SiteFooter, SiteHeader } from "@/components/home/SiteChrome"
import { Tag, VERMILION } from "@/components/home/Guide"
import { StudentNote } from "@/components/game/StudentNote"

// Lien « Donne ton avis » du pied de page (T24) : le meme formulaire que celui
// de la fin de 2e partie, ouvert a tout moment. Les messages arrivent dans
// game_feedback (type « mot », mode « site ») et Tym recoit un mail.
// Rien a indexer : une page de formulaire n'apporte rien aux moteurs.

export const metadata: Metadata = {
  title: "Donne ton avis",
  description: "Un mot pour l'étudiant derrière Blindz : ce qui t'a plu, ce qui t'a saoulé.",
  robots: { index: false, follow: true },
}

export default function AvisPage() {
  return (
    <div className="flex min-h-screen flex-col text-[#2e2014]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 pb-[5rem] pt-[4rem] sm:px-8">
        <Tag color={VERMILION}>Donne ton avis</Tag>
        <StudentNote context={{ mode: "site" }} className="mt-6" />
      </main>
      <SiteFooter />
    </div>
  )
}
