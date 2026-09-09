import type { Metadata } from "next"
import Link from "next/link"
import { AMBER, BLUE, FaqList, GuideShell, Li, Section, faqJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Guide "blind test en ligne gratuit" : la requete generique sur laquelle les
// packs payants et les listicles dominent. Tout ce qui est ecrit ici est
// verifie dans le code (limites, prix, modes, correction).

const URL = "https://blindz.app/blind-test-en-ligne-gratuit/"
const TITLE = "Blind test en ligne gratuit, sans inscription : comment jouer"
const DESC =
  "Jouer à un blind test en ligne gratuit, sans compte ni application, avec les playlists Spotify ou Deezer des joueurs. Autour d'une table, sur un seul téléphone ou à distance, jusqu'à 12 joueurs."
const UPDATED = "2026-09-08"

export const metadata: Metadata = {
  title: "Blind test en ligne gratuit, sans inscription",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const FAQ = [
  {
    q: "Le blind test est vraiment gratuit, sans piège ?",
    a: "Oui. blindz.app n'a pas de version payante, pas de publicité et rien à acheter dans le jeu. Parties illimitées, tous les modes, jusqu'à 12 joueurs par salle.",
  },
  {
    q: "Faut-il créer un compte ou installer une application ?",
    a: "Non. Un pseudo suffit, et tout se passe dans le navigateur, sur iPhone, Android ou PC. Créer un compte sert surtout à retrouver ton historique, tes stats et tes amis sur un autre appareil.",
  },
  {
    q: "D'où vient la musique ?",
    a: "Des playlists des joueurs. Chacun colle le lien de son profil ou d'une playlist publique Spotify ou Deezer, et la partie est générée à partir de ces morceaux. Les deux plateformes peuvent se mélanger dans la même partie.",
  },
  {
    q: "Combien de joueurs peuvent jouer ?",
    a: "Jusqu'à 12 par salle, autour d'une table comme à distance. Sur un seul téléphone (tout le monde pose un doigt sur l'écran), jusqu'à 5, parce que la plupart des téléphones ne suivent pas plus de cinq doigts à la fois.",
  },
]

export default function Page() {
  return (
    <GuideShell
      tag="Guide"
      tagColor={AMBER}
      title={<>Un blind test en ligne <em className="font-medium italic text-[#cc4830]">gratuit</em>, sans inscription</>}
      intro="Il n'y a ni compte à créer, ni application à installer, ni carte bancaire à sortir. Il faut un navigateur, les téléphones des joueurs, et le lien d'une playlist publique Spotify ou Deezer. Voilà comment ça se passe."
      updated="8 septembre 2026"
      currentHref="/blind-test-en-ligne-gratuit/"
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), faqJsonLd(FAQ)]}
    >
      <Section tag="Ce qu'il faut" title="Trois choses, et c'est tout">
        <ul>
          <Li>
            <span><strong>Un navigateur.</strong> Safari sur iPhone, Chrome sur Android, n'importe quoi sur PC. Il n'y a rien à télécharger ni à mettre à jour. Tu peux ajouter blindz.app à ton écran d'accueil et ça s'ouvre comme une app, mais ce n'est pas obligatoire.</span>
          </Li>
          <Li>
            <span><strong>Un pseudo.</strong> On ne te demande ni adresse mail ni mot de passe : tu le tapes et tu joues. Ton historique de parties reste un an sans compte, tant que tu restes sur le même navigateur.</span>
          </Li>
          <Li>
            <span><strong>Un lien.</strong> Celui de ton profil Spotify ou Deezer, ou d'une playlist publique. C'est de là que viennent les morceaux. Il faut juste que ce soit public : les titres likés sur Spotify ne le sont pas, mets-les dans une playlist publique avant.</span>
          </Li>
        </ul>
      </Section>

      <Section tag="Gratuit" title="Ce que gratuit veut dire ici" tone="ink">
        <p>
          Beaucoup de blind tests « gratuits » en ligne le sont jusqu'au moment où tu veux inviter plus de monde, débloquer une
          playlist ou enlever la pub. Sur blindz.app il n'y a ni version pro, ni achat dans le jeu, ni
          publicité. Parties illimitées, tous les modes, jusqu'à 12 joueurs par salle, sur toutes les plateformes. Le
          projet est fait par une personne, pas par un éditeur qui vend des packs, et il n'y a rien à vendre.
        </p>
      </Section>

      <Section tag="La différence" title="Pourquoi la plupart des blind tests en ligne se ressemblent" tone="deep">
        <p>
          La plupart de ceux qu'on a regardés fonctionnent sur le même modèle : l'éditeur prépare des playlists thématiques (années 80, rap
          français, films, hits du moment), tu en choisis une, et tout le monde joue dessus. Ou bien, l'inverse : tu
          construis ton propre quiz à la main, morceau par morceau, ce qui prend une heure avant de pouvoir jouer dix
          minutes.
        </p>
        <p>
          blindz.app ne fait ni l'un ni l'autre. Chaque joueur colle le lien de sa playlist, et la partie est générée
          automatiquement à partir des morceaux de tout le monde. Si personne n'a ramené de rap, il n'y a pas de rap. Si
          ton pote n'écoute que de la variété, toute la table va le savoir. Et c'est là que ça devient un jeu : en plus du
          titre et de l'artiste, il faut deviner <strong>qui a mis quoi</strong>.
        </p>
      </Section>

      <Section tag="Les modes" title="Trois façons de jouer" tone="blue">
        <ul>
          <Li color="#f4ecdb">
            <span><strong>Autour d'une table</strong> : un écran au milieu (télé, PC, ou le téléphone de l'organisateur) diffuse la musique et les scores, chacun scanne un QR code et répond depuis son téléphone. Ceux qui arrivent en retard entrent tout seuls entre deux parties.</span>
          </Li>
          <Li color="#f4ecdb">
            <span><strong>Un seul téléphone</strong> : tout le monde pose un doigt sur l'écran, la musique démarre quand toutes les zones sont tenues, le premier qui lâche prend le téléphone et tape sa réponse. Jusqu'à 5 joueurs.</span>
          </Li>
          <Li color="#f4ecdb">
            <span><strong>À distance</strong> : un code à 6 caractères, chacun joue de chez soi, avec un chat et un pierre-feuille-ciseaux pour patienter. Jusqu'à 12 joueurs.</span>
          </Li>
        </ul>
        <p>
          Le détail de chaque mode, avec les réglages et les pièges à éviter, est dans le guide{" "}
          <Link href="/blind-test-soiree/">organiser un blind test en soirée</Link>.
        </p>
      </Section>

      <Section tag="Bon à savoir" title="Avant de lancer la première partie" tone="amber">
        <ul>
          <Li color="#2e2014"><span>À plusieurs téléphones (autour d'une table ou à distance), les manches durent 10, 15, 20 ou 30 secondes (20 par défaut), et une partie fait 5, 10, 15 ou 20 manches. Dix manches, c'est cinq à dix minutes. Quand vous êtes nombreux, prenez 15 ou 20 manches, sinon tout le monde n'aura pas un de ses morceaux qui passe.</span></Li>
          <Li color="#2e2014"><span>Un point pour le titre, un pour l'artiste, un pour le bon « qui a mis quoi » (cette dernière question disparaît si une seule personne a importé de la musique). La vitesse ne rapporte rien, elle départage seulement les ex æquo. Sur un seul téléphone, c'est plus simple : 3 points pour titre et artiste, 1 point pour l'un des deux, parties de 5, 10 ou 15 manches.</span></Li>
          <Li color="#2e2014"><span>La correction est tolérante : fautes de frappe, accents, le « feat. » oublié, le titre et l'artiste inversés, ça passe.</span></Li>
          <Li color="#2e2014"><span>Spotify et Deezer se mélangent dans la même partie. Un joueur peut venir de l'un, un autre de l'autre.</span></Li>
        </ul>
      </Section>

      <Section tag="Questions" title="Ce qu'on nous demande le plus">
        <FaqList items={FAQ} />
      </Section>
    </GuideShell>
  )
}
