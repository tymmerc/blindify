import Image from "next/image"
import Link from "next/link"
import { publicPath } from "@/lib/publicPath"

// En-tete et pied de page communs a la landing et aux guides. Composants
// SERVEUR (aucun hook) : tout est dans le HTML pre-rendu.
// Palette du logo : vermillon, ambre, sauge, bleu acier sur encre et papier.

export const GUIDES = [
  { href: "/blind-test-en-ligne-gratuit/", label: "Blind test en ligne gratuit" },
  { href: "/blind-test-spotify/", label: "Blind test avec Spotify" },
  { href: "/blind-test-deezer/", label: "Blind test avec Deezer" },
  { href: "/blind-test-soiree/", label: "Blind test en soirée" },
  { href: "/comparatif-blind-test/", label: "Comparatif des blind tests" },
] as const

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-6 sm:px-8">
      <Link href="/" className="flex items-center gap-3 font-display text-2xl font-semibold tracking-tight">
        {/* Le logo (cle de sol) : sur papier creme, son B noir se lit sans tuile. */}
        <Image src={publicPath("/logo-mark.png")} alt="" width={40} height={40} priority className="h-10 w-10 object-contain" />
        blindz.app
      </Link>
      <nav aria-label="Navigation principale" className="flex items-center gap-5 text-[12px] font-bold uppercase tracking-[0.14em]">
        {/* FAQ en pastille bordee : en texte nu elle passait inapercue a cote
            du bouton Jouer. Bordure fine pour ne pas concurrencer le CTA. */}
        <Link
          href="/faq/"
          className="rounded-md border-[1.5px] border-[#2e2014] px-3 py-2 transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
        >
          FAQ
        </Link>
        {/* hover:text-* obligatoire : globals.css a un a:hover global en terracotta. */}
        <Link
          href="/jouer/"
          className="rounded-md border-2 border-[#2e2014] bg-[#2e2014] px-4 py-2 text-[#f4ecdb] shadow-[3px_3px_0_#cc4830] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#1d140b] hover:text-[#f4ecdb] hover:shadow-[1px_1px_0_#cc4830]"
        >
          Jouer
        </Link>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-[#2e2014] bg-[#2e2014] text-[#f4ecdb]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {/* Guides : maillage interne, les moteurs y trouvent les pages de contenu. */}
        <nav aria-label="Guides" className="mb-6 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]">
          {GUIDES.map(g => (
            <Link key={g.href} href={g.href} className="transition hover:text-[#d88418]">
              {g.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] font-bold uppercase tracking-[0.16em]">
          <span className="flex items-center gap-3">
            {/* Le logo (cle de sol) sur une tuile creme : son "B" est noir, il
                disparaitrait directement sur l'encre du pied de page. */}
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#f4ecdb]">
              <Image src={publicPath("/logo-mark.png")} alt="" width={30} height={30} className="object-contain" />
            </span>
            blindz.app
          </span>
          <nav aria-label="Pied de page" className="flex flex-wrap gap-5">
            <Link href="/faq/" className="transition hover:text-[#d88418]">FAQ</Link>
            <Link href="/mentions-legales/" className="transition hover:text-[#d88418]">Mentions légales</Link>
            <Link href="/confidentialite/" className="transition hover:text-[#d88418]">Confidentialité</Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
