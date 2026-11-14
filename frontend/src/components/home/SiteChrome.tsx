import Image from "next/image"
import Link from "next/link"
import { publicPath } from "@/lib/publicPath"
import { GUIDES } from "@/lib/guides"
import { BugReportLink } from "@/components/home/BugReportLink"
import { ThemeButton } from "@/components/ThemeButton"

// En-tete et pied de page communs a la landing et aux guides. Composants
// SERVEUR (aucun hook) : tout est dans le HTML pre-rendu. Seul ilot client :
// le bouton qui ouvre le signalement de bug (BugReportLink) et le rond
// clair / sombre (ThemeButton).
// Palette du logo : vermillon, ambre, sauge, bleu acier sur encre et papier.

// La liste des guides vit dans lib/guides (lue aussi par les tests).
export { GUIDES }

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-6 sm:px-8">
      <Link href="/" className="flex items-center gap-3 font-display text-2xl font-semibold tracking-tight">
        {/* Le logo (cle de sol) : sur papier creme, son B noir se lit sans tuile. */}
        <Image src={publicPath("/logo-mark.png")} alt="" width={40} height={40} priority className="h-10 w-10 object-contain dark:hidden" />
        <Image src={publicPath("/logo-mark-nuit.png")} alt="" width={40} height={40} className="h-10 w-10 object-contain hidden dark:block" />
        {/* Mention beta voulue par Tym (02/10) : un mot en italique, minuscule,
            couleur sourde. Ni pastille, ni point, ni majuscules espacees (refuses).
            A 390 px il n'y a pas la place a cote du nom sans pousser la nav :
            le mot passe dessous, dans la hauteur du logo. */}
        <span className="flex flex-col leading-none sm:flex-row sm:items-baseline sm:gap-2">
          {/* L'espace ne se voit pas (flex) mais garde "blindz.app bêta" en deux mots pour les moteurs. */}
          blindz.app{" "}
          <span className="mt-0.5 font-display text-[13px] font-medium italic tracking-normal text-ink-2 sm:mt-0 sm:text-[15px]">
            bêta
          </span>
        </span>
      </Link>
      <nav aria-label="Navigation principale" className="flex items-center gap-5 text-[12px] font-bold uppercase tracking-[0.14em]">
        {/* Rond clair / sombre (T30) : dans l'en-tete sur ordi seulement. Sur
            telephone l'en-tete est plein (il chevauchait le nom), il est en pied de page. */}
        <ThemeButton className="hidden sm:flex" />
        {/* FAQ en pastille bordee : en texte nu elle passait inapercue a cote
            du bouton Jouer. Bordure fine pour ne pas concurrencer le CTA. */}
        <Link
          href="/faq/"
          className="rounded-md border-[1.5px] border-line px-3 py-2 transition hover:bg-ink-block hover:text-on-ink"
        >
          FAQ
        </Link>
        {/* hover:text-* obligatoire : globals.css a un a:hover global en terracotta. */}
        <Link
          href="/jouer/"
          className="rounded-md border-2 border-line bg-ink-block px-4 py-2 text-on-ink shadow-[3px_3px_0_rgb(var(--c-vermillon))] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-ink-block-hover hover:text-on-ink hover:shadow-[1px_1px_0_rgb(var(--c-vermillon))]"
        >
          Jouer
        </Link>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-line bg-ink-block text-on-ink">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {/* La beta dite simplement, en phrase normale, avec de quoi signaler
            un souci : le formulaire existant (table bug_reports). */}
        <p className="mb-6 max-w-[40rem] text-[15px] leading-relaxed">
          blindz.app est encore en bêta, il reste sûrement quelques bugs. Si tu tombes sur un truc qui
          cloche, <BugReportLink>signale-le</BugReportLink>.
        </p>
        {/* Guides : maillage interne, les moteurs y trouvent les pages de contenu. */}
        <nav aria-label="Guides" className="mb-6 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]">
          {GUIDES.map(g => (
            <Link key={g.href} href={g.href} className="transition hover:text-ambre-txt">
              {g.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-[11px] font-bold uppercase tracking-[0.16em]">
          <span className="flex items-center gap-3">
            {/* Le logo (cle de sol) sur une tuile creme : son "B" est noir, il
                disparaitrait directement sur l'encre du pied de page. */}
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-paper">
              <Image src={publicPath("/logo-mark.png")} alt="" width={30} height={30} className="object-contain dark:hidden" />
              <Image src={publicPath("/logo-mark-nuit.png")} alt="" width={30} height={30} className="object-contain hidden dark:block" />
            </span>
            blindz.app
          </span>
          <ThemeButton className="sm:hidden" />
          <nav aria-label="Pied de page" className="flex flex-wrap gap-5">
            <Link href="/faq/" className="transition hover:text-ambre-txt">FAQ</Link>
            {/* Le formulaire du message de Tym (T24), ouvert a tout moment. */}
            <Link href="/avis/" className="transition hover:text-ambre-txt">Donne ton avis</Link>
            <Link href="/mentions-legales/" className="transition hover:text-ambre-txt">Mentions légales</Link>
            <Link href="/confidentialite/" className="transition hover:text-ambre-txt">Confidentialité</Link>
            <Link href="/conditions/" className="transition hover:text-ambre-txt">Conditions</Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
