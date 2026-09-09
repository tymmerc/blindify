import Link from "next/link"
import type { ReactNode } from "react"
import { GUIDES, SiteFooter, SiteHeader } from "@/components/home/SiteChrome"

// Gabarit des guides (pages de contenu SEO/GEO). Composants SERVEUR : le texte
// est dans le HTML exporte. Meme systeme visuel que la landing : palette du
// logo, Fraunces en titres, blocs colores, texte encre pleine.

export const INK = "#2e2014"
export const CREAM = "#f4ecdb"
export const VERMILION = "#cc4830"
export const AMBER = "#d88418"
export const BLUE = "#486090"

export function Tag({ color, children, light }: { color: string; children: ReactNode; light?: boolean }) {
  return (
    <p className={`flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.26em] ${light ? "text-[#f4ecdb]" : "text-[#2e2014]"}`}>
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {children}
    </p>
  )
}

const CTA =
  "inline-block rounded-md border-2 border-[#2e2014] bg-[#cc4830] px-7 py-4 font-display text-xl font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#b83f29] hover:text-[#f4ecdb] hover:shadow-[2px_2px_0_#2e2014]"

export function GuideShell({
  tag,
  tagColor,
  title,
  intro,
  updated,
  jsonLd,
  currentHref,
  children,
}: {
  tag: string
  tagColor: string
  title: ReactNode
  intro: string
  updated: string
  jsonLd: object[]
  currentHref: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen text-[#2e2014]">
      {jsonLd.map((obj, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }} />
      ))}
      <SiteHeader />
      <article>
        <header className="mx-auto max-w-4xl px-5 pb-[3.5rem] pt-[4rem] sm:px-8 lg:pt-[5rem]">
          <Tag color={tagColor}>{tag}</Tag>
          <h1 className="mt-5 font-display text-[2.4rem] font-semibold leading-[1.04] sm:text-[3.2rem] lg:text-[4rem]">
            {title}
          </h1>
          <p className="mt-6 max-w-[38rem] text-[1.1rem] leading-relaxed sm:text-[1.2rem]">{intro}</p>
          <p className="mt-5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#6b573f]">
            Mis à jour le {updated} · Lecture 4 min
          </p>
        </header>
        {children}
        <section className="border-t-2 border-[#2e2014]">
          <div className="mx-auto max-w-4xl px-5 py-[4.5rem] sm:px-8">
            <Tag color={VERMILION}>Prêt ?</Tag>
            <h2 className="mt-5 font-display text-[2.4rem] font-semibold leading-[1] sm:text-[3.4rem]">On lance ?</h2>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <Link href="/jouer/" className={CTA}>
                Jouer, c'est gratuit
              </Link>
              <Link
                href="/faq/"
                className="border-b-2 border-[#2e2014] pb-0.5 text-[13px] font-bold uppercase tracking-[0.14em] transition hover:border-[#cc4830] hover:text-[#cc4830]"
              >
                Une question ? La FAQ
              </Link>
            </div>
            <nav aria-label="Autres guides" className="mt-12 border-t-2 border-[rgba(46,32,20,.18)] pt-6">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#6b573f]">À lire aussi</p>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {GUIDES.filter(g => g.href !== currentHref).map(g => (
                  <li key={g.href}>
                    <Link href={g.href} className="border-b-2 border-[#2e2014] pb-0.5 text-[15px] font-semibold transition hover:border-[#cc4830] hover:text-[#cc4830]">
                      {g.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </section>
      </article>
      <SiteFooter />
    </div>
  )
}

type Tone = "paper" | "deep" | "ink" | "blue" | "amber"
const TONES: Record<Tone, { bg: string; text: string; tagColor: string; light: boolean; rule: string }> = {
  paper: { bg: "bg-[#f4ecdb]", text: "text-[#2e2014]", tagColor: VERMILION, light: false, rule: "border-[rgba(46,32,20,.18)]" },
  deep: { bg: "bg-[#ece1c8]", text: "text-[#2e2014]", tagColor: BLUE, light: false, rule: "border-[rgba(46,32,20,.18)]" },
  ink: { bg: "bg-[#2e2014]", text: "text-[#f4ecdb]", tagColor: AMBER, light: true, rule: "border-[rgba(244,236,219,.22)]" },
  blue: { bg: "bg-[#486090]", text: "text-[#f4ecdb]", tagColor: CREAM, light: true, rule: "border-[rgba(244,236,219,.45)]" },
  amber: { bg: "bg-[#d88418]", text: "text-[#2e2014]", tagColor: INK, light: false, rule: "border-[rgba(46,32,20,.3)]" },
}

export function Section({ id, tag, title, tone = "paper", children }: { id?: string; tag: string; title: ReactNode; tone?: Tone; children: ReactNode }) {
  const t = TONES[tone]
  return (
    <section id={id} className={`border-t-2 border-[#2e2014] ${t.bg} ${t.text}`}>
      <div className="mx-auto max-w-4xl px-5 py-[4rem] sm:px-8">
        <Tag color={t.tagColor} light={t.light}>{tag}</Tag>
        <h2 className="mt-4 font-display text-[1.9rem] font-semibold leading-[1.08] sm:text-[2.5rem]">{title}</h2>
        <div className={`guide-prose mt-6 space-y-5 text-[1.05rem] leading-relaxed [&_strong]:font-bold [&_a]:border-b-2 [&_a]:font-semibold [&_ul]:list-none [&_ul]:space-y-3 [&_li]:flex [&_li]:gap-3 [&_h3]:mt-8 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold`}>
          {children}
        </div>
      </div>
    </section>
  )
}

/** Puce carree coloree pour les listes. */
export function Li({ children, color = VERMILION }: { children: ReactNode; color?: string }) {
  return (
    <li>
      <span aria-hidden className="mt-[0.6rem] h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
      <span>{children}</span>
    </li>
  )
}

export function Steps({ items, light }: { items: Array<{ t: string; b: ReactNode }>; light?: boolean }) {
  return (
    <ol className="mt-2 grid gap-8 sm:grid-cols-2">
      {items.map((s, i) => (
        <li key={s.t} className={`border-t-2 pt-4 ${light ? "border-[rgba(244,236,219,.45)]" : "border-[#2e2014]"}`}>
          <span className={`font-display text-4xl font-medium italic ${light ? "" : "text-[#cc4830]"}`}>{i + 1}</span>
          <h3 className="mt-2 font-display text-xl font-semibold">{s.t}</h3>
          <p className="mt-2 leading-relaxed">{s.b}</p>
        </li>
      ))}
    </ol>
  )
}

export function FaqList({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <dl className="divide-y-2 divide-[rgba(46,32,20,.18)]">
      {items.map(item => (
        <div key={item.q} className="py-5 first:pt-0 last:pb-0">
          <dt className="font-display text-xl font-semibold">{item.q}</dt>
          <dd className="mt-2 leading-relaxed">{item.a}</dd>
        </div>
      ))}
    </dl>
  )
}

export function faqJsonLd(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(i => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  }
}

export function howToJsonLd(name: string, description: string, steps: Array<{ t: string; text: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    totalTime: "PT2M",
    step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.t, text: s.text })),
  }
}

export function webPageJsonLd(url: string, name: string, description: string, updated: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url,
    name,
    description,
    inLanguage: "fr",
    dateModified: updated,
    isPartOf: { "@type": "WebSite", name: "blindz.app", url: "https://blindz.app/" },
  }
}
