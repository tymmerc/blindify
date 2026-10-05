import type { Metadata } from "next"
import Link from "next/link"
import { AMBER, FaqList, GuideShell, Li, Section, faqJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Guide "blind test entre collegues". Verifie dans le code (05/10/2026) : a
// distance, chaque joueur entend l'extrait sur son appareil (seuls les joueurs
// autour d'une table sont muets) ; chat et pierre-feuille-ciseaux dans le salon ;
// 12 places par salle, hote compris ; on peut jouer sans rien importer ; aucun
// filtre sur les paroles explicites : le jeu passe ce que les joueurs ramenent.

const URL = "https://blindz.app/blind-test-entre-collegues/"
const TITLE = "Blind test entre collègues : afterwork, team building ou équipe en télétravail"
const DESC =
  "Un blind test entre collègues avec la musique de l'équipe : en salle de réunion sur l'écran, ou à distance pendant une visio. Gratuit, sans compte ni installation."
const UPDATED = "2026-10-05"

export const metadata: Metadata = {
  title: "Blind test entre collègues, au bureau ou à distance",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const FAQ = [
  {
    q: "Combien de temps prévoir ?",
    a: "Une partie de dix manches de 20 secondes prend cinq à dix minutes. Pour une demi-heure, comptez trois ou quatre parties : l'hôte relance dans la même salle, personne n'a à se reconnecter.",
  },
  {
    q: "Il y a un filtre sur les paroles ?",
    a: "Non, le jeu passe ce que les joueurs ont ramené. Si l'ambiance l'exige, précisez « playlist présentable » dans l'invitation.",
  },
  {
    q: "Il faut donner une adresse mail pro ?",
    a: "Non. On joue avec un pseudo, sans compte. Le compte ne sert qu'à retrouver son historique sur un autre appareil.",
  },
  {
    q: "On est cinquante au séminaire.",
    a: "Une salle a 12 places, donc il faut plusieurs salles, chacune avec son code et son classement. Le plus simple : une salle par table, et les gagnants de chaque table se retrouvent pour une finale.",
  },
]

export default function Page() {
  return (
    <GuideShell
      tag="Guide entre collègues"
      tagColor={AMBER}
      title={<>Un blind test entre <em className="font-medium italic text-[#cc4830]">collègues</em></>}
      intro="Le pot de départ, l'afterwork du jeudi, la fin d'après-midi d'un séminaire, ou une équipe éparpillée en télétravail. Un blind test fait avec la musique des collègues casse la glace mieux qu'un quiz préparé la veille, et personne n'a rien à préparer : chacun colle le lien d'une playlist, la partie se construit avec."
      updated="5 octobre 2026"
      currentHref="/blind-test-entre-collegues/"
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), faqJsonLd(FAQ)]}
    >
      <Section tag="Dans la même pièce" title="La salle de réunion et son écran">
        <p>
          L'écran de la salle de réunion ou le vidéoprojecteur fait l'écran central, en mode Autour d'une table. Il diffuse
          la musique et les scores, chacun scanne le QR code et répond depuis son téléphone. Si personne ne veut présenter,
          l'ordinateur branché passe en Je présente seulement et l'organisateur joue depuis son téléphone comme les autres.
        </p>
        <p>
          Attention au son : les téléphones restent muets, tout passe par l'écran central. Les enceintes d'une salle de
          réunion, c'est bien ; le haut-parleur d'un portable au bout d'une table de douze, beaucoup moins. Pour brancher
          l'écran, voir <Link href="/blind-test-tv/">le guide du blind test sur la télé</Link>, c'est la même chose avec un
          projecteur.
        </p>
      </Section>

      <Section tag="À distance" title="Une équipe en télétravail" tone="blue">
        <p>
          Le mode À distance : l'organisateur crée la salle et colle le code à 6 caractères dans le chat de la visio. Chacun
          rejoint depuis son ordinateur ou son téléphone et entend les extraits chez lui. En attendant les retardataires,
          il y a un chat et un pierre-feuille-ciseaux dans le salon. Jusqu'à 12 joueurs.
        </p>
        <ul>
          <Li color="#f4ecdb"><span><strong>Ne partagez pas le son dans la visio.</strong> Chacun a déjà l'extrait sur son appareil, le partager en plus ne fait que du décalage.</span></Li>
          <Li color="#f4ecdb"><span><strong>Coupez les micros pendant les extraits</strong>, ou mettez des écouteurs : sinon la musique de l'un revient dans le micro des autres avec une seconde de retard. Rallumez-les à la révélation, c'est le moment où on rigole.</span></Li>
        </ul>
        <p>
          Le détail du mode à distance est dans le guide du <Link href="/blind-test-en-ligne-gratuit/">blind test en ligne gratuit</Link>.
        </p>
      </Section>

      <Section tag="Ce qu'on montre" title="Chacun choisit ce qu'il dévoile" tone="deep">
        <p>
          Le cœur du jeu, c'est de deviner qui a mis quel morceau, et entre collègues c'est là que ça devient intéressant :
          le chef de projet qui écoute du métal, la stagiaire qui connaît tout Goldman. Mais personne n'est obligé de livrer
          ses écoutes.
        </p>
        <ul>
          <Li color="#486090"><span><strong>Une playlist, pas un compte.</strong> On colle le lien qu'on veut. Une playlist de dix morceaux faite pour l'occasion suffit, pas besoin de montrer tout son profil.</span></Li>
          <Li color="#486090"><span><strong>On peut jouer sans rien ramener.</strong> Il suffit qu'une personne de la salle ait importé de la musique. Les autres jouent sur ses morceaux, mais il faut au moins deux playlists pour la question « qui a mis ce morceau ».</span></Li>
          <Li color="#486090"><span><strong>Rien à installer, rien à acheter.</strong> Ça s'ouvre dans le navigateur, sur les ordinateurs du bureau comme sur les téléphones, et c'est gratuit : pas de devis ni d'abonnement à faire valider.</span></Li>
        </ul>
      </Section>

      <Section tag="Questions" title="Ce qu'on nous demande pour les afterworks">
        <FaqList items={FAQ} />
      </Section>
    </GuideShell>
  )
}
