import type { Metadata } from "next"
import Link from "next/link"
import { BLUE, FaqList, GuideShell, Li, Section, Steps, faqJsonLd, howToJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Guide "blind test avec Spotify". Les formats de liens et le fonctionnement de
// l'import viennent du code (profileImportService : /user/{id} et
// /playlist/{id}, import serveur via l'API publique Spotify, aucune connexion
// du joueur necessaire ; /jouer importe 50 titres par playlist, 200 playlists
// au plus pour un profil). « Qui a ajoute ? » : a partir de 3 joueurs
// (roundOwners.MIN_OWNER_QUESTION_PLAYERS). 12 joueurs par salle.
// T28 (06/11) : la requete la plus vue dans la Search Console est
// « comment faire un blind test sur spotify », le titre y repond.

const URL = "https://blindz.app/blind-test-spotify/"
const TITLE = "Comment faire un blind test sur Spotify avec ses playlists"
const DESC =
  "Copie le lien d'une playlist Spotify publique, colle-le sur Blindz et joue avec tes potes. C'est gratuit, sans compte, et personne n'a à se connecter à Spotify."
const UPDATED = "2026-11-06"

export const metadata: Metadata = {
  // Devient « Comment faire un blind test sur Spotify (gratuit) · Blindz » (gabarit du layout).
  title: "Comment faire un blind test sur Spotify (gratuit)",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const STEPS = [
  {
    t: "Copie le lien d'une playlist publique",
    text: "Dans l'appli Spotify, sur téléphone ou sur ordinateur, ouvre la playlist, touche les trois points, puis Partager et Copier le lien. La playlist doit être publique. Le lien de ton profil marche aussi : Blindz prend alors toutes tes playlists publiques.",
  },
  {
    t: "Colle-le sur Blindz",
    text: "Va sur blindz.app/jouer, tape un pseudo, colle le lien et appuie sur Importer ma musique. Pas de compte ni de mot de passe, et l'import se fait de notre côté : tu n'as pas à te connecter à Spotify.",
  },
  {
    t: "Lance la partie et invite tes potes",
    text: "Choisis comment jouer (autour d'une table, sur un seul téléphone ou à distance), puis envoie le code à 6 caractères ou fais scanner le QR code. Chacun colle son propre lien, et la partie mélange les morceaux de tout le monde.",
  },
]

const FAQ = [
  {
    q: "Ça marche sur téléphone ?",
    a: "Oui, tout se passe dans le navigateur du téléphone, il n'y a pas d'appli à installer. Sur mobile, Partager puis Copier le lien dans Spotify donne un lien court en spotify.link : colle-le tel quel, il passe.",
  },
  {
    q: "Faut-il que tout le monde ait Spotify ?",
    a: "Non. Personne ne se connecte à Spotify : chaque joueur colle simplement un lien public. Un joueur peut venir de Spotify et un autre de Deezer, les morceaux se mélangent dans la même partie. Et si quelqu'un n'a rien à importer, il joue quand même sur les morceaux des autres.",
  },
  {
    q: "Ma playlist est privée, ou ce sont mes titres likés, je fais comment ?",
    a: "Spotify ne laisse lire ni les playlists privées ni les titres likés. Pour une playlist privée, ouvre-la dans Spotify, touche les trois points et rends-la publique. Pour les titres likés, mets ceux que tu veux dans une nouvelle playlist publique et colle son lien.",
  },
  {
    q: "Je peux coller le lien de mon profil Spotify ?",
    a: "Oui. Avec un lien de profil (open.spotify.com/user/…), Blindz importe toutes les playlists publiques de ce profil. Avec un lien de playlist (open.spotify.com/playlist/…), seulement celle-là. Un lien de morceau ou d'album ne marche pas.",
  },
  {
    q: "On peut jouer à combien ?",
    a: "Jusqu'à 12 joueurs par salle. À deux, on devine le titre et l'artiste. À partir de trois, il y a une question en plus : qui a ramené ce morceau ?",
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
      title={<>Comment faire un blind test avec <em className="font-medium italic text-[#cc4830]">vos</em> playlists Spotify</>}
      intro="Tu copies le lien d'une playlist publique, tu le colles sur Blindz, et la partie se lance avec la musique de tout le monde. C'est gratuit, il n'y a ni compte à créer ni appli à installer, et personne ne se connecte à Spotify. Ça marche sur téléphone comme sur ordinateur."
      updated="6 novembre 2026"
      currentHref="/blind-test-spotify/"
      heroCta
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), howToJsonLd(TITLE, DESC, STEPS), faqJsonLd(FAQ)]}
    >
      <Section tag="En trois étapes" title="Deux minutes, montre en main">
        <Steps items={STEPS.map(s => ({ t: s.t, b: s.text }))} />
      </Section>

      <Section tag="Les liens" title="Ce que Blindz sait lire" tone="ink">
        <p>Deux formats de lien :</p>
        <ul>
          <Li color="#d88418"><span><strong>Une playlist</strong> : <code className="font-mono text-[0.95em]">open.spotify.com/playlist/…</code>. Elle doit être publique (dans Spotify : les trois points de la playlist, puis « Rendre publique » si ce n'est pas déjà le cas).</span></Li>
          <Li color="#d88418"><span><strong>Un profil</strong> : <code className="font-mono text-[0.95em]">open.spotify.com/user/…</code>. Blindz importe les playlists publiques de ce profil d'un coup (jusqu'à 200 playlists, et 50 titres par playlist). Pratique quand tu ne veux pas choisir.</span></Li>
        </ul>
        <p>
          Les titres likés, les playlists privées et les playlists « collaboratives non publiques » ne passent pas :
          Spotify ne les rend pas accessibles. La solution tient en trente secondes, une playlist publique avec les
          morceaux que tu veux. Et le lien court spotify.link que donne Partager sur mobile ? Colle-le tel
          quel, il passe.
        </p>
      </Section>

      <Section tag="La différence" title="Vos morceaux, pas un pack" tone="deep">
        <p>
          Certains blind tests « Spotify » demandent de se connecter à son compte et génèrent un quiz sur ton propre
          historique. D'autres proposent des packs par genre ou par décennie, les mêmes pour tout le monde.
          Ici, le principe est différent : chacun ramène ses playlists, la partie mélange celles de tous les joueurs
          présents, et à partir de trois joueurs, en plus du titre et de l'artiste, il faut deviner{" "}
          <strong>qui a mis quoi</strong>. C'est là que ça devient un jeu de soirée et pas un quiz.
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
