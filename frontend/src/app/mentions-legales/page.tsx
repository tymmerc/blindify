import type React from "react"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur, hébergeur et propriété intellectuelle du site Blindz.",
}

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen text-[#2e2014] pb-20">
      <div className="mx-auto max-w-2xl px-5 pt-10">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Retour à l'accueil
          </Link>
        </div>

        <div className="mb-10 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Légal</p>
          <h1 className="font-display text-4xl font-semibold md:text-5xl">
            Mentions <em className="font-medium italic text-[#c65133]">légales</em>
          </h1>
          <p className="text-sm text-[#8a7558]">Dernière mise à jour : 5 août 2026</p>
        </div>

        <div className="space-y-6">
          <Section title="Éditeur du site" accent="#c65133">
            <p>Le site Blindz (accessible à l'adresse blindz.app) est édité par :</p>
            <p className="mt-3">
              <strong>Tyméo Mercier</strong>
              <br />
              Entrepreneur individuel
              <br />
              SIRET : 100 347 251 00017
              <br />
              Code APE : 6201Z, Programmation informatique
              <br />
              Adresse : Panganaggio, 20167 Peri, France
            </p>
            <p className="mt-1">
              <strong>Contact :</strong> <ContactLink />
            </p>
          </Section>

          <Section title="Directeur de la publication" accent="#e0a32e">
            <p>Tyméo Mercier</p>
          </Section>

          <Section title="Hébergeur" accent="#7d9471">
            <p>Le site est hébergé par :</p>
            <p className="mt-3">
              <strong>OVH SAS</strong>
              <br />
              2 rue Kellermann
              <br />
              59100 Roubaix
              <br />
              France
            </p>
          </Section>

          <Section title="Propriété intellectuelle" accent="#c65133">
            <p>
              La structure du site, son identité visuelle, ses textes et ses éléments graphiques sont la
              propriété de l'éditeur, sauf mention contraire. Toute reproduction ou réutilisation sans
              autorisation est interdite.
            </p>
            <p className="mt-3">
              Les métadonnées et extraits musicaux importés depuis des liens de profils publics Spotify ou
              Deezer restent la propriété de leurs ayants droit respectifs. Blindz ne revendique aucun
              droit sur ces contenus et se contente de les utiliser pour le déroulement du jeu.
            </p>
          </Section>

          <Section title="Responsabilité" accent="#e0a32e">
            <p>
              L'éditeur s'efforce de garder les informations du site à jour, mais ne peut garantir
              l'exactitude ou l'exhaustivité de tout le contenu. L'utilisation du site se fait sous ta
              propre responsabilité.
            </p>
          </Section>

          <Section title="Données personnelles" accent="#7d9471">
            <p>
              Le traitement de tes données personnelles est détaillé dans notre{" "}
              <Link
                href="/confidentialite"
                className="font-bold text-[#c65133] underline decoration-[#c65133]/40 underline-offset-2 transition hover:decoration-[#c65133]"
              >
                politique de confidentialité
              </Link>
              .
            </p>
          </Section>
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/confidentialite"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Confidentialité
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border-2 border-[#2e2014] bg-[#c65133] px-5 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#f4ecdb] shadow-[3px_3px_0_#2e2014] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#2e2014]"
          >
            Jouer
          </Link>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  accent,
  children,
}: {
  title: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]"
      style={{ borderLeft: `6px solid ${accent}` }}
    >
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#6b573f]">{title}</h2>
      <div className="space-y-1 text-[15px] leading-relaxed text-[#4a3a28]">{children}</div>
    </div>
  )
}

function ContactLink() {
  return (
    <a
      href="mailto:tym.mercier@gmail.com"
      className="font-bold text-[#c65133] underline decoration-[#c65133]/40 underline-offset-2 transition hover:decoration-[#c65133]"
    >
      tym.mercier@gmail.com
    </a>
  )
}
