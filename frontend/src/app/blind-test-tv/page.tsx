import type { Metadata } from "next"
import Link from "next/link"
import { BLUE, FaqList, GuideShell, Li, Section, faqJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Guide "blind test sur la tele". Verifie dans le code (05/10/2026) : en mode
// Autour d'une table, les telephones des joueurs ne jouent pas le son
// (MultiplayerGameClient, isEventParticipant) sauf si l'ecran central decroche
// plus de 6 s (hostGone) ; wake lock sur l'ecran de l'hote ; bouton Pause de
// l'hote ; 12 places par salle, hote compris ; code de salle a taper sur /jouer/.
// Navigateurs integres des teles connectees : jamais testes, on le dit.

const URL = "https://blindz.app/blind-test-tv/"
const TITLE = "Blind test sur la télé, avec les téléphones pour répondre : brancher l'écran, le son et le QR code"
const DESC =
  "Un blind test sur la télé, chacun répondant sur son téléphone : ordinateur en HDMI ou recopie d'écran, où sort le son, et le QR code à scanner depuis le canapé."
const UPDATED = "2026-10-05"

export const metadata: Metadata = {
  title: "Blind test sur la télé, les téléphones pour répondre",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const FAQ = [
  {
    q: "Les téléphones des joueurs font du bruit aussi ?",
    a: "Non. Autour d'une table, la musique ne sort que de l'écran central, les téléphones servent à répondre. Ça évite l'écho de dix haut-parleurs décalés.",
  },
  {
    q: "Et si l'ordinateur branché sur la télé plante ?",
    a: "La partie continue. Si l'écran central se déconnecte plus de quelques secondes, le son passe tout seul sur les téléphones des joueurs, le temps de le relancer.",
  },
  {
    q: "Combien de joueurs devant une seule télé ?",
    a: "Une salle a 12 places, l'écran central compris quand il présente seulement : 11 joueurs qui répondent depuis leur téléphone.",
  },
  {
    q: "Le navigateur de ma télé connectée suffit ?",
    a: "On ne l'a pas testé, et ces navigateurs gèrent souvent mal le son et les pages animées. Un ordinateur en HDMI ou la recopie d'écran d'un téléphone sont plus sûrs.",
  },
]

export default function Page() {
  return (
    <GuideShell
      tag="Guide télé"
      tagColor={BLUE}
      title={<>Un blind test sur la <em className="font-medium italic text-[#cc4830]">télé</em>, les téléphones pour répondre</>}
      intro="C'est le mode Autour d'une table : la télé diffuse la musique et affiche les scores, et chacun répond depuis son téléphone après avoir scanné un QR code. Le jeu lui-même ne demande rien de spécial. Le vrai sujet, c'est de faire arriver l'image et le son sur la télé, alors voilà les solutions, de la plus sûre à la plus bricolée."
      updated="5 octobre 2026"
      currentHref="/blind-test-tv/"
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), faqJsonLd(FAQ)]}
    >
      <Section tag="L'image" title="Trois façons de mettre blindz.app sur la télé">
        <h3>Un ordinateur branché en HDMI</h3>
        <p>
          La solution qui ne réserve pas de surprise. Un câble HDMI entre l'ordinateur et la télé, le navigateur ouvert sur
          blindz.app/jouer, et le son part dans la télé par le même câble. Mets le navigateur en plein écran : la page est
          faite pour être lue de loin, avec la manche, le chrono et les scores en grand.
        </p>
        <h3>La recopie d'écran d'un téléphone ou d'une tablette</h3>
        <p>
          Recopie de l'écran sur iPhone vers une Apple TV ou une télé compatible AirPlay, diffusion d'écran sur Android vers
          une Chromecast ou une télé qui l'accepte (le nom change selon la marque). Ça marche bien, avec deux précautions :
        </p>
        <ul>
          <Li><span><strong>Active le mode Ne pas déranger.</strong> Tout ce qui s'affiche sur le téléphone s'affiche sur la télé, notifications comprises.</span></Li>
          <Li><span><strong>Laisse blindz.app au premier plan.</strong> La page demande au téléphone de ne pas se mettre en veille tant que la salle est ouverte, mais si tu passes sur une autre appli, la télé la montre.</span></Li>
        </ul>
        <h3>Pas de télé ?</h3>
        <p>
          Le téléphone de l'organisateur ou un ordinateur portable posé au milieu de la table fait très bien l'écran central.
          Ajoute une enceinte Bluetooth et tu as la même partie.
        </p>
      </Section>

      <Section tag="Le son" title="La musique sort de l'écran central, et de lui seul" tone="ink">
        <p>
          Les téléphones des joueurs restent muets : ils servent à taper les réponses. Tout le son passe donc par la télé
          ou par l'enceinte branchée sur l'ordinateur. Monte le volume plus que pour un film, une table qui cherche un titre
          parle fort.
        </p>
        <ul>
          <Li color="#d88418"><span><strong>Si l'écran central décroche</strong> (wifi qui saute, ordinateur qui redémarre), le son bascule tout seul sur les téléphones des joueurs au bout de quelques secondes, et la partie continue.</span></Li>
          <Li color="#d88418"><span><strong>Besoin d'une pause ?</strong> L'organisateur a un bouton Pause sur l'écran central : la partie est gelée pour tout le monde.</span></Li>
          <Li color="#d88418"><span><strong>Extraits de 10, 15, 20 ou 30 secondes</strong>, à régler dans le salon avant de lancer. 20 par défaut, 15 si la table connaît ses classiques.</span></Li>
        </ul>
      </Section>

      <Section tag="Les joueurs" title="Le QR code, depuis le canapé" tone="deep">
        <p>
          Quand l'organisateur crée la salle, la télé affiche un QR code et un code à 6 caractères. Chacun scanne avec
          l'appareil photo de son téléphone, tape un pseudo et colle le lien de sa playlist, ou continue sans si ce soir il
          joue sur la musique des autres.
        </p>
        <ul>
          <Li color="#486090"><span><strong>Le QR code ne passe pas de loin ?</strong> Approche-toi de l'écran, ou va sur blindz.app/jouer et tape le code à 6 caractères.</span></Li>
          <Li color="#486090"><span><strong>Présenter et jouer quand même.</strong> L'organisateur met l'ordinateur en Je présente seulement, puis scanne le QR code avec son propre téléphone comme tout le monde. Il pilote la partie sur l'ordinateur et répond sur son téléphone.</span></Li>
          <Li color="#486090"><span><strong>Les retardataires</strong> qui scannent pendant une partie voient un écran d'attente et entrent tout seuls à la fin de la partie en cours.</span></Li>
        </ul>
        <p>
          Le déroulé d'une partie et les pièges classiques (playlists privées, manches trop longues) sont dans le{" "}
          <Link href="/blind-test-soiree/">guide de la soirée</Link>.
        </p>
      </Section>

      <Section tag="Questions" title="Ce qu'on nous demande sur la télé">
        <FaqList items={FAQ} />
      </Section>
    </GuideShell>
  )
}
