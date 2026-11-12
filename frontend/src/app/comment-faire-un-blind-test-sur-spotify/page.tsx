import type { Metadata } from "next"
import Link from "next/link"
import { AMBER, FaqList, GuideShell, Li, Section, Steps, faqJsonLd, howToJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Tuto « comment faire un blind test sur Spotify » (T28, 06/11). Article a cote
// de /blind-test-spotify/, qui ne bouge pas (elle amene deja des joueurs) :
// celui-ci repond a la question telle qu'on la tape dans Google, en montrant
// les deux facons de faire (l'appli Spotify seule avec un animateur, puis
// Blindz), et renvoie vers la page Spotify pour le detail des liens.
// Faits verifies dans le code : aucune connexion Spotify (import serveur,
// profileImportService), 12 joueurs par salle, « qui a ajoute ? » a partir de
// 3 joueurs (roundOwners), liens spotify.link resolus, libelle « Importer ma
// musique » sur /jouer, « Je présente seulement » en mode Autour d'une table.

const URL = "https://blindz.app/comment-faire-un-blind-test-sur-spotify/"
const TITLE = "Comment faire un blind test sur Spotify : deux façons gratuites"
const DESC =
  "Deux façons de faire un blind test avec Spotify : l'appli seule avec un animateur, ou Blindz, où chacun colle sa playlist et tout le monde joue. Gratuit."
const UPDATED = "2026-11-06"

export const metadata: Metadata = {
  // Devient « Comment faire un blind test sur Spotify (gratuit) · Blindz » (gabarit du layout).
  title: "Comment faire un blind test sur Spotify (gratuit)",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const APP_SPOTIFY = [
  {
    t: "Prépare la playlist",
    b: "L'animateur choisit ou crée une playlist avec les morceaux qu'il veut faire deviner. Plus elle est variée, plus c'est drôle.",
  },
  {
    t: "Cache ce qui s'affiche",
    b: "Le titre apparaît sur l'écran du téléphone, et parfois sur l'enceinte ou la télé connectée. Branche une enceinte et retourne le téléphone, ou garde l'écran pour toi.",
  },
  {
    t: "Lance, coupe, compte",
    b: "Lecture aléatoire, quelques secondes de chaque morceau, pause. Le premier qui crie la bonne réponse marque, et l'animateur note les points sur un papier.",
  },
]

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
    q: "Peut-on faire un blind test avec Spotify gratuit ?",
    a: "Oui. Avec l'appli seule, la version gratuite suffit, avec des pubs entre les morceaux et, sur téléphone, un nombre limité de titres qu'on peut passer. Avec Blindz, personne n'a besoin de Premium ni de se connecter à Spotify : il faut juste le lien d'une playlist publique.",
  },
  {
    q: "Ça marche sur téléphone ?",
    a: "Oui, Blindz s'ouvre dans le navigateur du téléphone, il n'y a pas d'appli à installer. Sur mobile, Partager puis Copier le lien dans Spotify donne un lien court en spotify.link : colle-le tel quel, il passe.",
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
    a: "Avec l'appli seule, autant qu'il y a de monde dans la pièce, tant que l'animateur arrive à suivre. Avec Blindz, jusqu'à 12 joueurs par salle, ou cinq sur un seul téléphone. À deux, on devine le titre et l'artiste ; à partir de trois, il y a une question en plus : qui a ramené ce morceau ?",
  },
  {
    q: "L'animateur peut jouer aussi ?",
    a: "Avec l'appli seule, difficilement : c'est lui qui a choisi les morceaux. Avec Blindz, oui. Autour d'une table, il met l'écran central en Je présente seulement, puis scanne le QR code avec son téléphone comme tout le monde.",
  },
]

export default function Page() {
  return (
    <GuideShell
      tag="Tuto Spotify"
      tagColor={AMBER}
      title="Comment faire un blind test sur Spotify"
      intro="Il y a deux façons de faire. Avec l'appli Spotify seule, quelqu'un joue l'animateur et lance les morceaux. Avec Blindz, chacun colle le lien de sa playlist et tout le monde joue, autour d'une table ou à distance. Les deux sont gratuites, voilà comment faire l'une et l'autre."
      updated="6 novembre 2026"
      currentHref="/comment-faire-un-blind-test-sur-spotify/"
      heroCta
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), howToJsonLd("Faire un blind test avec ses playlists Spotify sur Blindz", DESC, STEPS), faqJsonLd(FAQ)]}
    >
      <Section tag="Façon 1" title="Avec l'appli Spotify seule">
        <p>
          C'est la version à l'ancienne, et elle marche très bien pour une petite soirée. Il faut un téléphone ou un
          ordinateur avec Spotify, une enceinte si possible, et quelqu'un qui accepte de faire l'animateur.
        </p>
        <Steps items={APP_SPOTIFY} />
        <p>
          Les limites, tu les verras vite : l'animateur ne joue pas puisqu'il connaît la playlist, les points se
          comptent à la main, et tout le monde devine sur la musique d'une seule personne. En version gratuite, il y
          a aussi des pubs entre les morceaux.
        </p>
      </Section>

      <Section tag="Façon 2" title="Avec Blindz, sur les playlists de tout le monde" tone="deep">
        <p>
          Ici, personne ne fait l'animateur. Chacun ramène sa playlist Spotify, Blindz mélange les morceaux, coupe les
          extraits et compte les points. Gratuit, sans compte, et sans connexion à Spotify : Blindz lit seulement la
          liste des morceaux de la playlist publique.
        </p>
        <Steps items={STEPS.map(s => ({ t: s.t, b: s.text }))} />
        <p>
          Les formats de liens acceptés, les profils et les liens courts sont détaillés sur la page{" "}
          <Link href="/blind-test-spotify/">blind test avec ses playlists Spotify</Link>.
        </p>
      </Section>

      <Section tag="Ensuite" title="Trois façons de jouer" tone="ink">
        <ul>
          <Li color={AMBER}><span><strong>Autour d'une table.</strong> Un écran central (la télé, un ordinateur ou un téléphone posé au milieu) diffuse la musique et les scores, chacun scanne le QR code et répond sur son téléphone. Le détail est dans le guide <Link href="/blind-test-soiree/">blind test en soirée</Link>.</span></Li>
          <Li color={AMBER}><span><strong>Sur un seul téléphone.</strong> Chacun pose un doigt sur l'écran, et le premier qui lâche prend le téléphone pour répondre. Jusqu'à cinq joueurs.</span></Li>
          <Li color={AMBER}><span><strong>À distance.</strong> Tu envoies le code à 6 caractères, chacun entend les extraits chez lui. Voir le <Link href="/blind-test-en-ligne-gratuit/">blind test en ligne gratuit</Link>.</span></Li>
        </ul>
        <p>
          À partir de trois joueurs, en plus du titre et de l'artiste, il faut deviner qui a ramené le morceau. C'est
          souvent là qu'on rigole le plus.
        </p>
      </Section>

      <Section tag="Questions" title="Ce qu'on nous demande">
        <FaqList items={FAQ} />
      </Section>
    </GuideShell>
  )
}
