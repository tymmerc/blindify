import type { Metadata } from "next"
import Link from "next/link"
import { BLUE, FaqList, GuideShell, Li, Section, Steps, faqJsonLd, howToJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Guide "blind test avec Spotify". Les formats de liens et le fonctionnement de
// l'import viennent du code (profileImportService : /user/{id} et
// /playlist/{id}, import serveur via l'API publique Spotify, aucune connexion
// du joueur necessaire).

const URL = "https://blindz.app/blind-test-spotify/"
const TITLE = "Faire un blind test avec ses playlists Spotify"
const DESC =
  "Comment faire un blind test avec ses propres playlists Spotify, entre amis, sans que personne ne se connecte à Spotify : copier le lien d'une playlist publique ou d'un profil, le coller, et jouer."
const UPDATED = "2026-09-08"

export const metadata: Metadata = {
  title: "Blind test avec ses playlists Spotify",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const STEPS = [
  {
    t: "Copie le lien d'une playlist publique",
    text: "Dans Spotify, ouvre la playlist, touche les trois points, puis Partager et Copier le lien. La playlist doit être publique. Tu peux aussi copier le lien de ton profil : blindz.app prendra tes playlists publiques (jusqu'à 50 titres par playlist).",
  },
  {
    t: "Ouvre blindz.app et choisis un pseudo",
    text: "Sur blindz.app/jouer, tape un pseudo : il n'y a ni compte ni mot de passe, et rien à installer.",
  },
  {
    t: "Colle le lien et importe",
    text: "Colle le lien Spotify dans le champ prévu et appuie sur Importer ma musique. L'import se fait côté serveur, personne n'a besoin de se connecter à Spotify.",
  },
  {
    t: "Crée la partie et invite",
    text: "Choisis un mode (autour d'une table, un seul téléphone, ou à distance), envoie le code à 6 caractères ou fais scanner le QR code. Chaque joueur colle son propre lien, et la partie est générée avec les morceaux de tout le monde.",
  },
]

const FAQ = [
  {
    q: "Faut-il que tout le monde ait Spotify ?",
    a: "Non. Personne ne se connecte à Spotify : chaque joueur colle simplement un lien public. Un joueur peut venir de Spotify et un autre de Deezer, les morceaux se mélangent dans la même partie. Et si quelqu'un n'a rien à importer, il joue quand même sur les morceaux des autres.",
  },
  {
    q: "Quels liens Spotify sont acceptés ?",
    a: "Le lien d'une playlist (open.spotify.com/playlist/…) ou celui d'un profil (open.spotify.com/user/…). Avec un profil, ce sont toutes les playlists publiques de ce profil qui sont importées.",
  },
  {
    q: "Mes titres likés ne s'importent pas, pourquoi ?",
    a: "Les titres likés ne sont pas une playlist publique, Spotify ne les expose pas. Crée une playlist, mets-y les morceaux que tu veux, rends-la publique, et colle son lien.",
  },
  {
    q: "La musique est jouée en entier ?",
    a: "Non, ce sont des extraits courts, de 10 à 30 secondes selon le réglage de la partie (20 secondes par défaut). C'est un blind test, pas une écoute.",
  },
]

export default function Page() {
  return (
    <GuideShell
      tag="Guide Spotify"
      tagColor={BLUE}
      title={<>Un blind test avec <em className="font-medium italic text-[#cc4830]">vos</em> playlists Spotify</>}
      intro="Le lien d'une playlist publique, un pseudo, et la partie se génère avec les morceaux de tout le monde, sans que personne ne se connecte à Spotify ni n'installe quoi que ce soit. Voilà comment faire, étape par étape."
      updated="8 septembre 2026"
      currentHref="/blind-test-spotify/"
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), howToJsonLd(TITLE, DESC, STEPS), faqJsonLd(FAQ)]}
    >
      <Section tag="En quatre étapes" title="Deux minutes, montre en main">
        <Steps items={STEPS.map(s => ({ t: s.t, b: s.text }))} />
      </Section>

      <Section tag="Les liens" title="Ce que blindz.app sait lire" tone="ink">
        <p>Deux formats de lien :</p>
        <ul>
          <Li color="#d88418"><span><strong>Une playlist</strong> : <code className="font-mono text-[0.95em]">open.spotify.com/playlist/…</code>. Elle doit être publique (dans Spotify : les trois points de la playlist, puis « Rendre publique » si ce n'est pas déjà le cas).</span></Li>
          <Li color="#d88418"><span><strong>Un profil</strong> : <code className="font-mono text-[0.95em]">open.spotify.com/user/…</code>. blindz.app importe les playlists publiques de ce profil d'un coup (jusqu'à 200 playlists, et 50 titres par playlist). Pratique quand tu ne veux pas choisir.</span></Li>
        </ul>
        <p>
          Les titres likés, les playlists privées et les playlists « collaboratives non publiques » ne passent pas :
          Spotify ne les rend pas accessibles. La solution tient en trente secondes, une playlist publique avec les
          morceaux que tu veux. Autre piège : si Partager te donne un lien court du type spotify.link, ouvre-le
          dans le navigateur et copie l'adresse qui commence par open.spotify.com.
        </p>
      </Section>

      <Section tag="La différence" title="Vos morceaux, pas un pack" tone="deep">
        <p>
          Certains blind tests « Spotify » demandent de se connecter à son compte et génèrent un quiz sur ton propre
          historique. D'autres proposent des packs par genre ou par décennie, les mêmes pour tout le monde.
          Ici, le principe est différent : chacun ramène ses playlists, la partie mélange celles de tous les joueurs
          présents, et en plus du titre et de l'artiste, il faut deviner <strong>qui a mis quoi</strong>. C'est là que
          ça devient un jeu de soirée et pas un quiz.
        </p>
        <p>
          Le résultat dépend entièrement de la table : une playlist de rap, une de variété et une d'électro donnent une
          partie qui ne ressemble à aucune autre, et où chacun a ses moments de gloire et ses trous.
        </p>
      </Section>

      <Section tag="Ensuite" title="Choisir comment jouer" tone="blue">
        <p>
          Une fois la musique importée, trois façons de jouer : autour d'une table avec un écran central et des QR codes,
          sur un seul téléphone à doigt posé, ou à distance avec un code. Le détail est dans le guide{" "}
          <Link href="/blind-test-soiree/">organiser un blind test en soirée</Link>, et si tes potes sont sur Deezer,
          le guide <Link href="/blind-test-deezer/">blind test avec Deezer</Link> explique la même chose de leur côté.
        </p>
      </Section>

      <Section tag="Questions" title="Ce qu'on nous demande sur Spotify">
        <FaqList items={FAQ} />
      </Section>
    </GuideShell>
  )
}
