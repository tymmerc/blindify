import type React from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ContactLink, ExternalLegalLink, Section } from "@/components/legal/LegalBlocks"

export const metadata: Metadata = {
  alternates: { canonical: "https://blindz.app/confidentialite/" },
  title: "Politique de confidentialité",
  description:
    "Comment Blindz collecte, utilise et protège tes données. Pas de revente, pas de tracking publicitaire.",
}

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen text-ink pb-20">
      <div className="mx-auto max-w-2xl px-5 pt-10">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line bg-paper-deep px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition hover:bg-ink-block hover:text-on-ink"
          >
            Retour à l'accueil
          </Link>
        </div>

        <div className="mb-10 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-terra-txt">Légal</p>
          <h1 className="font-display text-4xl font-semibold md:text-5xl">
            Politique de <em className="font-medium italic text-terra-txt">confidentialité</em>
          </h1>
          <p className="text-sm text-sourd">Dernière mise à jour : 8 novembre 2026</p>
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
              {/* T33 (08/11/2026) : texte propose, a valider par Tym. Exige par Google (regles de l'API YouTube). */}
              <Item>
                <strong>Les playlists YouTube</strong> : quand tu colles le lien d&apos;une playlist YouTube ou
                YouTube Music, notre serveur demande à YouTube (Google) la liste de ses vidéos, avec leur titre et
                le nom de leur chaîne, par l&apos;API officielle de YouTube. Seul l&apos;identifiant de la playlist
                part chez Google : ni ton pseudo, ni ton adresse, et aucun compte Google n&apos;est utilisé. On ne
                garde que les morceaux retrouvés chez Deezer, rien de YouTube. Ce que Google reçoit suit la{" "}
                <ExternalLegalLink href="https://policies.google.com/privacy">politique de confidentialité de Google</ExternalLegalLink>.
              </Item>
              <Item>
                <strong>Ton identité Discord</strong>, seulement si tu joues depuis l'Activité Discord (Blindz
                lancé dans un salon vocal) : ton identifiant Discord, ton pseudo et ton avatar, pour te
                reconnaître d'un salon à l'autre et te remettre ta musique. Pas d'e-mail, pas de liste de
                serveurs ni d'amis. Dans ce cas, il n'y a pas de cookie : la session reste en mémoire de
                l'Activité. Tu peux retirer l'accès de Blindz à tout moment dans tes paramètres Discord
                (Applications autorisées), et supprimer ton compte depuis le bouton Réglages de l&apos;Activité.
              </Item>
              <Item>
                <strong>Ton retour de fin de partie</strong>, seulement si tu en donnes un : ta réponse à
                « Ça s'est bien passé ? », le texte que tu écris si tu signales un bug, le mode de jeu, le
                code de la partie, la version du site et la signature technique de ton navigateur (le
                « user agent », coupé à 300 caractères). Il n'y a ni pseudo ni adresse IP dans la table des
                retours, mais l'envoi passe quand même par les journaux du serveur décrits juste en dessous.
                Quand on la connaît, le retour est rattaché à la partie jouée, qui garde la liste de ses
                joueurs : un retour n'est donc pas anonyme, il est pseudonyme. Le texte libre contient ce que
                tu y écris, alors évite d'y mettre des infos personnelles. Les retours servent uniquement à
                corriger les bugs et à améliorer le jeu, et sont effacés automatiquement au bout de 12 mois.
              </Item>
              <Item>
                <strong>Ton message et ton contact</strong>, seulement si tu écris dans le bloc « Hello, je suis
                l&apos;étudiant derrière Blindz » (fin de ta 2e partie ou lien « Donne ton avis ») : le texte
                que tu écris et, si tu le remplis, le pseudo Insta ou l&apos;e-mail que tu laisses. Le contact
                sert uniquement à te répondre, il n&apos;est jamais affiché ni partagé, et il n&apos;entre dans
                aucune liste d&apos;envoi. Le message et le contact sont envoyés par mail à l&apos;éditeur pour
                qu&apos;il les lise, puis gardés 12 mois avec les autres retours et effacés automatiquement.
                Pour les faire effacer plus tôt, écris à <ContactLink /> en indiquant le contact laissé.
              </Item>
              <Item>
                <strong>Les journaux techniques du serveur.</strong> Comme sur la plupart des sites, notre
                serveur web (nginx) note chaque requête reçue : adresse IP, date et heure, page demandée,
                page d'où tu viens et navigateur. Ces journaux servent à la sécurité et à comprendre les
                pannes. Ils sont effacés automatiquement au bout de 15 jours au plus.
              </Item>
            </ul>
          </Section>

          <Section title="Le mode invité" accent="#7d9471">
            <p>
              Tu peux jouer sans créer de compte. Dans ce cas, on te génère un identifiant anonyme
              aléatoire, gardé sur ton appareil jusqu&apos;à un an après ta dernière visite, pour que tu
              retrouves ton pseudo et tes parties quand tu reviens. Aucune donnée personnelle n&apos;est
              demandée. Si tu vides ton navigateur, changes d&apos;appareil ou ouvres Blindz depuis une
              appli comme Snapchat, cette progression ne te suit pas, sauf si tu choisis un mot de passe
              dans Mon compte (« Garder mes infos »). Tu peux tout supprimer à tout moment depuis Mon
              compte.
            </p>
          </Section>

          <Section title="Parties regardées en direct" accent="#e0a32e">
            <p>
              L'éditeur de Blindz peut regarder une partie à plusieurs en direct, pour améliorer le jeu.
              Il ne joue pas et ne voit que ce que voient les joueurs. Les joueurs le voient à l'écran
              (« 👀 1 spectateur »), et rien n'est enregistré. Pour être prévenu, il reçoit un mail interne
              avec le mode, l'heure et les pseudos de la salle, rien de plus.
            </p>
          </Section>

          <Section title="Cookies" accent="#c65133">
            <p>
              Blindz pose deux cookies de session, en httpOnly et secure, qui servent seulement à te
              reconnaître quand tu reviens : l&apos;un dure 24 heures, l&apos;autre un an après ta dernière
              visite. Pas de cookie de tracking publicitaire, pas d&apos;outil d&apos;analytics tiers, pas de
              partage avec des régies.
            </p>
          </Section>

          <Section title="Partage des données" accent="#e0a32e">
            <p>
              On ne vend pas tes données et on ne les partage pas avec des tiers à des fins commerciales.
              Tes informations restent chez nous, utilisées uniquement pour faire tourner le jeu.
            </p>
            {/* T33 (08/11/2026) : texte propose, a valider par Tym. */}
            <p className="mt-3">
              Seule exception, technique : pour importer une playlist YouTube, son identifiant est envoyé à
              Google (YouTube), et rien d&apos;autre.
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
              Le site et ses données sont hébergés en Allemagne, chez Hetzner Online GmbH, dans son
              centre de données de Falkenstein. Les données restent donc dans l'Union européenne, où
              s'applique le RGPD.
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
            href="/conditions/"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line bg-transparent px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition hover:bg-ink-block hover:text-on-ink"
          >
            Conditions
          </Link>
          <Link
            href="/mentions-legales"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line bg-transparent px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition hover:bg-ink-block hover:text-on-ink"
          >
            Mentions légales
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border-2 border-line bg-terra px-5 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-on-ink shadow-[3px_3px_0_rgb(var(--c-shadow))] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))]"
          >
            Jouer
          </Link>
        </div>
      </div>
    </div>
  )
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-terra" />
      <span>{children}</span>
    </li>
  )
}
