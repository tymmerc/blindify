import type { Metadata } from "next"
import Link from "next/link"
import { AMBER, FaqList, GuideShell, Li, Section, Steps, faqJsonLd, howToJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Guide "blind test avec Deezer". Formats de liens verifies dans le code
// (profileImportService : deezer.com/profile/{id} et deezer.com/playlist/{id},
// avec ou sans /fr/), import via l'API publique Deezer, sans connexion.

const URL = "https://blindz.app/blind-test-deezer/"
const TITLE = "Faire un blind test avec ses playlists Deezer"
const DESC =
  "Comment faire un blind test avec ses propres playlists Deezer, entre amis, sans connexion : copier le lien d'un profil ou d'une playlist publique, le coller, et jouer. Compatible avec les joueurs Spotify."
const UPDATED = "2026-09-08"

export const metadata: Metadata = {
  title: "Blind test avec ses playlists Deezer",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const STEPS = [
  {
    t: "Copie le lien de ton profil ou d'une playlist",
    text: "Dans Deezer, ouvre ton profil ou une playlist, touche Partager, puis Copier le lien. Le profil ou la playlist doit être public.",
  },
  {
    t: "Ouvre blindz.app et choisis un pseudo",
    text: "Sur blindz.app/jouer, choisis un pseudo, c'est la seule chose qu'on te demande.",
  },
  {
    t: "Colle le lien et importe",
    text: "Colle le lien Deezer dans le champ prévu et appuie sur Importer ma musique. L'import passe par l'API publique de Deezer, personne n'a besoin de se connecter.",
  },
  {
    t: "Crée la partie et invite",
    text: "Choisis un mode, envoie le code à 6 caractères ou fais scanner le QR code. Chaque joueur colle son propre lien, Deezer ou Spotify, et la partie est générée avec les morceaux de tout le monde.",
  },
]

const FAQ = [
  {
    q: "Quels liens Deezer sont acceptés ?",
    a: "Le lien d'un profil (deezer.com/profile/…, avec ou sans /fr/ devant) ou d'une playlist (deezer.com/playlist/…). Avec un profil, ce sont ses playlists publiques qui sont importées, jusqu'à 200 playlists et 50 titres par playlist.",
  },
  {
    q: "Je suis sur Deezer et mes potes sur Spotify, ça marche ?",
    a: "Oui, dans la même partie. Chacun colle son lien, les morceaux se mélangent. Il faut juste que les playlists ou les profils soient publics des deux côtés.",
  },
  {
    q: "Faut-il un abonnement Deezer ?",
    a: "Non. blindz.app lit les playlists publiques via l'API de Deezer et joue des extraits courts. Aucun compte Deezer n'est demandé aux joueurs, même pas à celui qui importe.",
  },
  {
    q: "Ma playlist n'est pas trouvée, pourquoi ?",
    a: "Le plus souvent parce qu'elle est privée. Dans Deezer, ouvre la playlist, ses réglages, et passe-la en publique. Vérifie aussi que le lien collé est bien celui de la playlist ou du profil, pas celui d'un morceau ou d'un album.",
  },
]

export default function Page() {
  return (
    <GuideShell
      tag="Guide Deezer"
      tagColor={AMBER}
      title={<>Un blind test avec <em className="font-medium italic text-[#cc4830]">vos</em> playlists Deezer</>}
      intro="Le lien de ton profil Deezer ou d'une playlist publique, un pseudo, et la partie se génère avec les morceaux de tout le monde, y compris ceux des potes qui sont sur Spotify. Aucune connexion, rien à installer."
      updated="8 septembre 2026"
      currentHref="/blind-test-deezer/"
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), howToJsonLd(TITLE, DESC, STEPS), faqJsonLd(FAQ)]}
    >
      <Section tag="En quatre étapes" title="Le même chemin, côté Deezer">
        <Steps items={STEPS.map(s => ({ t: s.t, b: s.text }))} />
      </Section>

      <Section tag="Les liens" title="Ce que blindz.app sait lire" tone="ink">
        <p>Deux formats de lien :</p>
        <ul>
          <Li color="#d88418"><span><strong>Un profil</strong> : <code className="font-mono text-[0.95em]">deezer.com/profile/…</code> (le <code className="font-mono text-[0.95em]">/fr/</code> devant ne gêne pas). blindz.app importe les playlists publiques du profil d'un coup (jusqu'à 200 playlists, 50 titres par playlist).</span></Li>
          <Li color="#d88418"><span><strong>Une playlist</strong> : <code className="font-mono text-[0.95em]">deezer.com/playlist/…</code>. Elle doit être publique.</span></Li>
        </ul>
        <p>
          Les liens vers un morceau, un album ou un artiste ne sont pas des playlists et ne s'importent pas. Si tu veux
          jouer sur un album, mets ses titres dans une playlist publique. Et si Partager te donne un lien court du type
          link.deezer.com, ouvre-le dans le navigateur et copie l'adresse qui commence par deezer.com.
        </p>
      </Section>

      <Section tag="Deezer et Spotify" title="Les deux dans la même partie" tone="deep">
        <p>
          Question fréquente en soirée : la moitié de la table est sur Deezer, l'autre sur Spotify.
          Ici ça ne change rien. Chaque joueur colle son lien, d'où qu'il vienne, et les extraits sont mélangés dans la
          même partie. Personne ne se connecte à quoi que ce soit, blindz.app lit les playlists publiques via les API des
          deux services.
        </p>
        <p>
          Et dans les parties à plusieurs téléphones, en plus du titre et de l'artiste, il faut deviner <strong>qui a mis quoi</strong>.
          Le guide côté Spotify est ici : <Link href="/blind-test-spotify/">blind test avec ses playlists Spotify</Link>.
        </p>
      </Section>

      <Section tag="Ensuite" title="Choisir comment jouer" tone="blue">
        <p>
          Autour d'une table avec un écran central et des QR codes, sur un seul téléphone à doigt posé, ou à distance
          avec un code à 6 caractères, jusqu'à 12 joueurs. Tout est expliqué dans le guide{" "}
          <Link href="/blind-test-soiree/">organiser un blind test en soirée</Link>.
        </p>
      </Section>

      <Section tag="Questions" title="Ce qu'on nous demande sur Deezer">
        <FaqList items={FAQ} />
      </Section>
    </GuideShell>
  )
}
