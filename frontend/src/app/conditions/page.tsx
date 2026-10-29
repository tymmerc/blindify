import type { Metadata } from "next"
import Link from "next/link"
import { ContactLink, DiscordSupportLink, Section } from "@/components/legal/LegalBlocks"

// Conditions d'utilisation (T17a, 29/10/2026). Discord demande une URL publique
// de « Terms of Service » pour verifier l'appli. On n'y ecrit que ce qui est vrai
// de Blindz aujourd'hui, en s'appuyant sur les mentions legales, la politique de
// confidentialite et docs/CONDITIONS-API-MUSIQUE.md. Ce n'est pas un texte type.

export const metadata: Metadata = {
  alternates: { canonical: "https://blindz.app/conditions/" },
  title: "Conditions d'utilisation",
  description: "Les règles du jeu Blindz : service gratuit, écoute privée des extraits, comportement, âge, compte Discord.",
}

const INLINE_LINK =
  "font-bold text-[#c65133] underline decoration-[#c65133]/40 underline-offset-2 transition hover:decoration-[#c65133]"

const PILL =
  "inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"

export default function ConditionsPage() {
  return (
    <div className="min-h-screen text-[#2e2014] pb-20">
      <div className="mx-auto max-w-2xl px-5 pt-10">
        <div className="mb-8">
          <Link href="/" className={`${PILL} bg-[#ece1c8]`}>
            Retour à l&apos;accueil
          </Link>
        </div>

        <div className="mb-10 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">Légal</p>
          <h1 className="font-display text-4xl font-semibold md:text-5xl">
            Conditions <em className="font-medium italic text-[#c65133]">d&apos;utilisation</em>
          </h1>
          <p className="text-sm text-[#8a7558]">Dernière mise à jour : 29 octobre 2026</p>
        </div>

        <div className="space-y-6">
          <Section title="En bref" accent="#c65133">
            <p>
              Blindz est un blind test qu&apos;on joue avec ses propres playlists, sur le site blindz.app ou
              dans Discord. Il est édité par Tyméo Mercier, entrepreneur individuel (le détail est dans les{" "}
              <Link href="/mentions-legales/" className={INLINE_LINK}>
                mentions légales
              </Link>
              ). En jouant, tu acceptes les règles de cette page. Elles tiennent en quelques minutes de
              lecture.
            </p>
          </Section>

          <Section title="Le service" accent="#e0a32e">
            <p>
              Blindz est gratuit, sans publicité et sans compte obligatoire. Il est encore en bêta : il reste
              sûrement des bugs, le site peut être coupé pour une mise à jour ou une panne, et des fonctions
              peuvent changer ou disparaître. On fait de notre mieux pour qu&apos;il marche, mais on ne
              garantit pas qu&apos;il soit disponible à toute heure ni qu&apos;une partie aille toujours
              jusqu&apos;au bout.
            </p>
          </Section>

          <Section title="La musique, en écoute privée" accent="#7d9471">
            <p>
              Blindz n&apos;héberge aucune musique. Les extraits de 30 secondes sont fournis par Deezer, y
              compris pour les playlists importées depuis Spotify, qui ne sert qu&apos;à lire la liste des
              morceaux. Pour importer une playlist, elle doit être publique.
            </p>
            <p className="mt-3">
              L&apos;écoute des extraits est réservée à un usage privé, entre amis ou en famille. Tu ne peux
              pas t&apos;en servir pour une diffusion en public (bar, commerce, entreprise, soirée payante) ni
              en direct sur Twitch, YouTube ou ailleurs. N&apos;enregistre pas les extraits pour les
              réutiliser.
            </p>
          </Section>

          <Section title="Ton comportement" accent="#c65133">
            <p>
              Ton pseudo, tes messages dans le chat d&apos;une partie et les noms de tes playlists sont vus
              par les autres joueurs. Pas d&apos;insultes, de propos haineux, de contenu sexuel, ni
              d&apos;infos personnelles sur quelqu&apos;un d&apos;autre. On peut retirer un pseudo, un message
              ou une partie qui ne respecte pas ça, sans prévenir.
            </p>
            <p className="mt-3">
              Ne cherche pas non plus à casser le jeu : pas de triche par un programme, pas de surcharge
              volontaire du serveur, pas d&apos;accès aux données des autres joueurs. Si tu trouves une faille,
              écris-nous plutôt, on la corrigera.
            </p>
          </Section>

          <Section title="L'âge pour jouer" accent="#e0a32e">
            <p>
              Blindz est fait pour les 15 ans et plus. Si tu as moins de 15 ans, demande à un parent avant de
              jouer. Dans Discord, il faut en plus avoir l&apos;âge minimum que Discord demande dans ton pays.
            </p>
          </Section>

          <Section title="Ton compte Discord" accent="#7d9471">
            <p>
              Si tu joues depuis l&apos;Activité Discord, Blindz lit ton identifiant, ton pseudo et ton avatar
              Discord, rien d&apos;autre : pas d&apos;e-mail, pas de liste de serveurs ni d&apos;amis. Tout
              est expliqué dans la{" "}
              <Link href="/confidentialite/" className={INLINE_LINK}>
                politique de confidentialité
              </Link>
              . Ton compte Discord reste soumis aux conditions de Discord.
            </p>
            <p className="mt-3">
              Tu peux effacer tes données Blindz avec le bouton Réglages de l&apos;Activité, et retirer
              l&apos;accès de Blindz dans Discord (Paramètres, Applications autorisées). Sur le site, la
              suppression est dans les Réglages.
            </p>
          </Section>

          <Section title="Les marques" accent="#c65133">
            <p>
              Spotify, Deezer et Discord sont des marques qui appartiennent à leurs propriétaires. Blindz est
              un projet indépendant : il n&apos;est ni lié à ces services, ni soutenu par eux. Les titres, les
              pochettes et les extraits restent la propriété de leurs ayants droit.
            </p>
          </Section>

          <Section title="Changements et droit applicable" accent="#e0a32e">
            <p>
              Ces conditions peuvent changer quand le jeu change. La date en haut de la page indique la
              dernière version. Elles sont soumises au droit français. En cas de souci, écris-nous
              d&apos;abord : on préfère toujours régler ça à l&apos;amiable.
            </p>
          </Section>

          <Section title="Contact" accent="#7d9471">
            <p>
              Une question, un bug, un pseudo à signaler ? Écris à <ContactLink />, ou passe sur{" "}
              <DiscordSupportLink />.
            </p>
          </Section>
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link href="/mentions-legales/" className={`${PILL} bg-transparent`}>
            Mentions légales
          </Link>
          <Link href="/confidentialite/" className={`${PILL} bg-transparent`}>
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
