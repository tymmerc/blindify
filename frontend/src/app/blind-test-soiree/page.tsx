import type { Metadata } from "next"
import Link from "next/link"
import { FaqList, GuideShell, Li, Section, Steps, VERMILION, faqJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Guide "blind test en soiree". Chiffres verifies dans le code : manches de
// 10/15/20/30 s (20 par defaut), parties de 5/10/15/20 manches, 12 joueurs par
// salle, 5 sur un seul telephone (multi-touch iPhone), ecran de l'hote maintenu
// allume (wake lock), retardataires qui entrent entre deux parties.

const URL = "https://blindz.app/blind-test-soiree/"
const TITLE = "Organiser un blind test en soirée : écran central, QR code ou un seul téléphone"
const DESC =
  "Comment organiser un blind test en soirée sans rien préparer : un écran au milieu et les téléphones des invités, ou un seul téléphone à doigt posé. Réglages, déroulé, pièges à éviter."
const UPDATED = "2026-09-08"

export const metadata: Metadata = {
  title: "Organiser un blind test en soirée",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const TABLE_STEPS = [
  {
    t: "L'organisateur crée la salle",
    b: "Sur blindz.app/jouer, pseudo, lien de sa playlist, puis Créer une partie et Autour d'une table. Il choisit s'il joue aussi ou s'il présente seulement (son écran sert alors de scène : musique et scores, mais il ne répond pas).",
  },
  {
    t: "Les invités scannent le QR code",
    b: "Un QR code et un code à 6 caractères s'affichent sur l'écran central. Chacun scanne avec son téléphone, tape un pseudo et colle le lien de sa playlist. Ceux qui n'ont rien à importer jouent quand même, sur les morceaux des autres.",
  },
  {
    t: "On règle et on lance",
    b: "Nombre de manches (5, 10, 15 ou 20) et durée d'un extrait (10, 15, 20 ou 30 secondes, 20 par défaut), directement depuis le salon. Puis Lancer la partie.",
  },
  {
    t: "Chacun répond sur son tel",
    b: "La musique sort de l'écran central. Sur chaque téléphone : titre, artiste, et qui a mis ce morceau (cette dernière question n'apparaît que si au moins deux joueurs ont importé de la musique). À la fin de la manche, tout le monde voit les réponses de tout le monde et le classement.",
  },
]

const FAQ = [
  {
    q: "Quelqu'un arrive en retard, il peut rejoindre ?",
    a: "Oui. S'il scanne le QR code pendant une partie, il voit un écran d'attente et entre tout seul dès que la partie en cours se termine, sans que l'organisateur ait quoi que ce soit à faire.",
  },
  {
    q: "L'écran de l'organisateur s'éteint au bout d'un moment ?",
    a: "Normalement non : blindz.app demande au téléphone de rester allumé tant que la salle est ouverte, et ça marche sur les iPhone récents et sur Android. Pense quand même à le brancher : diffuser de la musique pendant une heure, ça consomme.",
  },
  {
    q: "Combien de temps dure une partie ?",
    a: "Comptez cinq à dix minutes pour dix manches de 20 secondes, le temps des révélations compris.",
  },
  {
    q: "On est plus de 12, on fait comment ?",
    a: "Deux salles, avec deux écrans : une salle accepte 12 joueurs au plus. Et quel que soit le nombre, pensez aux manches : chaque manche joue le morceau d'un seul joueur, donc avec 5 manches et 10 joueurs, la moitié de la table ne verra jamais passer sa musique. Nombreux, prenez 15 ou 20 manches.",
  },
]

export default function Page() {
  return (
    <GuideShell
      tag="Guide soirée"
      tagColor={VERMILION}
      title={<>Organiser un blind test en <em className="font-medium italic text-[#cc4830]">soirée</em></>}
      intro="Un écran au milieu et les téléphones des invités, ou un seul téléphone qui passe de main en main. Dans les deux cas il n'y a rien à préparer : chacun ramène sa playlist, la partie se génère toute seule. Voilà comment ça se déroule, et les deux ou trois pièges à éviter."
      updated="8 septembre 2026"
      currentHref="/blind-test-soiree/"
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), faqJsonLd(FAQ)]}
    >
      <Section tag="Avant que les gens arrivent" title="Une seule chose à demander à tes invités">
        <p>
          Qu'ils aient une playlist publique sur Spotify ou Deezer, ou un profil public. C'est tout. Pas besoin qu'ils
          installent quoi que ce soit ni qu'ils créent un compte, ils scanneront un QR code en arrivant. Si tu veux gagner
          cinq minutes, envoie le message la veille : « ramenez une playlist publique, on fait un blind test avec vos
          musiques ». L'intérêt par rapport à un pack « années 2000 », c'est que les morceaux sont les leurs, et qu'une
          partie du jeu consiste à deviner qui a mis quoi.
        </p>
        <p>
          Les guides pour copier le bon lien : <Link href="/blind-test-spotify/">côté Spotify</Link> et{" "}
          <Link href="/blind-test-deezer/">côté Deezer</Link>. Les deux se mélangent dans la même partie.
        </p>
      </Section>

      <Section tag="Autour d'une table" title="Un écran au milieu, un téléphone par joueur" tone="ink">
        <p>
          Le mode fait pour une soirée. L'écran central, c'est la télé avec un PC branché, un ordinateur posé sur la
          table, ou tout simplement le téléphone de l'organisateur avec une enceinte. Jusqu'à 12 joueurs.
        </p>
        <Steps light items={TABLE_STEPS} />
      </Section>

      <Section tag="Un seul téléphone" title="Tout le monde pose un doigt" tone="amber">
        <p>
          Pas un téléphone pour chacun ? Ce mode tient sur un seul, jusqu'à 5 joueurs (la plupart des téléphones ne suivent pas
          plus de cinq doigts à la fois). Les règles :
        </p>
        <ul>
          <Li color="#2e2014"><span>Chacun pose un doigt sur sa zone de l'écran. La musique ne démarre que quand toutes les zones sont tenues.</span></Li>
          <Li color="#2e2014"><span>Le premier qui lâche prend le téléphone, se cache des autres, et tape sa réponse.</span></Li>
          <Li color="#2e2014"><span>S'il se plante, on passe au deuxième qui a lâché, sans révéler le titre. Titre et artiste : 3 points, l'un des deux seulement : 1 point. Parties de 5, 10 ou 15 manches.</span></Li>
          <Li color="#2e2014"><span>Ici on joue sur la musique importée sur ce téléphone, ou sur le fonds commun de tout ce que les joueurs de blindz.app ont déjà ramené si rien n'est importé. Pas de « qui a mis quoi » dans ce mode : un seul tel, une seule bibliothèque.</span></Li>
        </ul>
      </Section>

      <Section tag="Les pièges" title="Ce qui gâche une partie, et comment l'éviter" tone="deep">
        <ul>
          <Li><span><strong>Les playlists privées.</strong> Le piège numéro un. « Mon lien ne marche pas » veut presque toujours dire « ma playlist est privée ». Trente secondes dans Spotify ou Deezer pour la passer en publique.</span></Li>
          <Li><span><strong>Le volume du téléphone-scène.</strong> Le haut-parleur d'un téléphone ne suffit pas à dix personnes qui parlent. Une enceinte Bluetooth change la soirée.</span></Li>
          <Li><span><strong>Les manches trop longues.</strong> 30 secondes, c'est bien pour des morceaux obscurs ; pour une table qui connaît ses classiques, 15 secondes rendent le jeu nerveux et drôle. Tu peux changer entre deux parties.</span></Li>
          <Li><span><strong>Les mauvais perdants.</strong> La vitesse ne donne pas de point, elle départage seulement les ex æquo. Un point titre, un point artiste, un point « qui a mis quoi ». Dis-le avant de lancer, ça évite le débat.</span></Li>
        </ul>
      </Section>

      <Section tag="Questions" title="Ce qu'on nous demande sur les soirées">
        <FaqList items={FAQ} />
      </Section>
    </GuideShell>
  )
}
