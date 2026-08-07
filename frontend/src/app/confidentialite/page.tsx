import type React from "react"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Comment Blindz collecte, utilise et protège tes données. Pas de revente, pas de tracking publicitaire.",
}

export default function ConfidentialitePage() {
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
            Politique de <em className="font-medium italic text-[#c65133]">confidentialité</em>
          </h1>
          <p className="text-sm text-[#8a7558]">Dernière mise à jour : 5 août 2026</p>
        </div>

        <div className="space-y-6">
          <Section title="En résumé" accent="#c65133">
            <p>
              Blindz est un jeu de blind test musical. On garde le strict minimum pour te faire jouer et
              suivre ta progression. On ne revend rien, on ne partage rien avec des tiers, et il n'y a
              aucun tracking publicitaire.
            </p>
          </Section>

          <Section title="Données collectées" accent="#e0a32e">
            <p>Selon la façon dont tu utilises Blindz, on peut traiter :</p>
            <ul className="mt-3 space-y-2">
              <Item>
                <strong>Un pseudo</strong> (obligatoire pour jouer). C'est le nom affiché dans le jeu et
                les classements.
              </Item>
              <Item>
                <strong>Un mot de passe</strong>, uniquement si tu crées un compte. Il n'est jamais stocké
                en clair : on garde une empreinte chiffrée (bcrypt).
              </Item>
              <Item>
                <strong>Un email</strong>, seulement si tu choisis de le renseigner. Il n'est pas demandé à
                l'inscription et reste optionnel.
              </Item>
              <Item>
                <strong>Tes statistiques de jeu</strong> : scores, parties jouées, progression. Ça sert à
                afficher ton historique et les classements.
              </Item>
              <Item>
                <strong>Les métadonnées des titres</strong> que tu importes depuis un lien de profil public
                Spotify ou Deezer (titre, artiste, extrait). On ne récupère rien de ton compte Spotify ou
                Deezer, juste ce qui est nécessaire pour construire la partie à partir du lien que tu
                fournis.
              </Item>
            </ul>
          </Section>

          <Section title="Le mode invité" accent="#7d9471">
            <p>
              Tu peux jouer sans créer de compte. Dans ce cas, on te génère un identifiant anonyme
              aléatoire, gardé sur ton appareil pendant un an pour que tu retrouves ton pseudo et
              tes parties quand tu reviens. Aucune donnée personnelle n'est demandée. Si tu vides
              ton navigateur ou changes d'appareil, cette progression est perdue. Tu peux la
              supprimer à tout moment depuis les Réglages.
            </p>
          </Section>

          <Section title="Cookies" accent="#c65133">
            <p>
              Blindz pose un seul cookie : un cookie de session, en httpOnly et secure, qui sert à te
              garder connecté pendant que tu joues. Pas de cookie de tracking publicitaire, pas d'outil
              d'analytics tiers, pas de partage avec des régies.
            </p>
          </Section>

          <Section title="Partage des données" accent="#e0a32e">
            <p>
              On ne vend pas tes données et on ne les partage pas avec des tiers à des fins commerciales.
              Tes informations restent chez nous, utilisées uniquement pour faire tourner le jeu.
            </p>
          </Section>

          <Section title="Tes droits (RGPD)" accent="#7d9471">
            <p>Conformément au RGPD, tu disposes d'un droit d'accès, de rectification et d'effacement de tes données.</p>
            <p className="mt-3">
              Ces actions arriveront bientôt en self-service dans tes Réglages. En attendant, écris-nous et
              on s'en occupe : <ContactLink />.
            </p>
          </Section>

          <Section title="Hébergement" accent="#c65133">
            <p>
              Les données sont hébergées en France, chez OVH. L'infrastructure et la localisation
              respectent le cadre européen de protection des données.
            </p>
          </Section>

          <Section title="Contact" accent="#e0a32e">
            <p>
              Une question sur tes données ou cette politique ? Écris à <ContactLink />.
            </p>
          </Section>
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/mentions-legales"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Mentions légales
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

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c65133]" />
      <span>{children}</span>
    </li>
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
