import type { Metadata } from "next"
import Link from "next/link"
import { AMBER, FaqList, GuideShell, Li, Section, faqJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Guide "blind test entre collegues". Verifie dans le code (05/10/2026) : a
// distance, chaque joueur entend l'extrait sur son appareil (seuls les joueurs
// autour d'une table sont muets) ; chat et pierre-feuille-ciseaux dans le salon ;
// 12 places par salle, hote compris ; on peut jouer sans rien importer ; aucun
// filtre sur les paroles explicites : le jeu passe ce que les joueurs ramenent ;
// un titre appartient au premier qui l'a importe sur tout le site (une playlist
// d'equipe collee par tous ne compte que pour le premier) ; une nouvelle partie
// repioche dans les memes bibliotheques, sans ecarter les titres deja joues.

const URL = "https://blindz.app/blind-test-entre-collegues/"
const TITLE = "Blind test entre collègues : afterwork, team building ou équipe en télétravail"
const DESC =
  "Un blind test entre collègues avec la musique de l'équipe : en salle de réunion sur l'écran, ou à distance pendant une visio. Gratuit et sans compte."
const UPDATED = "2026-10-05"

export const metadata: Metadata = {
  title: "Blind test entre collègues ou en télétravail",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const FAQ = [
  {
    q: "Combien de temps prévoir ?",
    a: "Une partie de dix manches de 20 secondes prend cinq à dix minutes, et l'hôte en relance une autre dans la même salle sans que personne ait à se reconnecter. Chaque nouvelle partie repioche dans les mêmes playlists : pour en enchaîner plusieurs, demande plutôt une vingtaine de titres à chacun, sinon les mêmes morceaux reviendront vite.",
  },
  {
    q: "Il y a un filtre sur les paroles ?",
    a: "Non, le jeu passe ce que les joueurs ont ramené. Si l'ambiance l'exige, précise « playlist présentable » dans l'invitation.",
  },
  {
    q: "Il faut donner une adresse mail pro ?",
    a: "Non. On joue avec un pseudo, sans compte. Le compte ne sert qu'à retrouver son historique sur un autre appareil.",
  },
  {
    q: "On est cinquante au séminaire.",
    a: "Il faudra plusieurs salles, chacune avec son écran, son code et son classement, puisqu'une salle s'arrête à 12 places. Le plus simple : une salle par table, et les gagnants de chaque table se retrouvent pour une finale.",
  },
]

export default function Page() {
  return (
    <GuideShell
      tag="Guide entre collègues"
      tagColor={AMBER}
      title={<>Un blind test entre <em className="font-medium italic text-[#cc4830]">collègues</em></>}
      intro="Le pot de départ, l'afterwork du jeudi, la fin d'après-midi d'un séminaire, ou une équipe éparpillée en télétravail. Avec un blind test fait sur la musique des collègues, on apprend vite des choses les uns sur les autres, et il n'y a presque rien à préparer : chacun colle le lien d'une playlist, la partie se construit avec."
      updated="5 octobre 2026"
      currentHref="/blind-test-entre-collegues/"
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), faqJsonLd(FAQ)]}
    >
      <Section tag="Dans la même pièce" title="La salle de réunion et son écran">
        <p>
          L'écran de la salle de réunion ou le vidéoprojecteur fait l'écran central, en mode Autour d'une table. Il diffuse
          la musique et les scores, chacun scanne le QR code et répond depuis son téléphone. Si l'organisateur veut jouer
          aussi, il met l'ordinateur branché en Je présente seulement, puis scanne le QR code avec son propre téléphone
          comme tout le monde.
        </p>
        <p>
          Attention au son : les téléphones restent muets, tout passe par l'écran central. Les enceintes d'une salle de
          réunion, c'est bien ; le haut-parleur d'un portable au bout d'une table de douze, beaucoup moins. Pour le
          branchement, <Link href="/blind-test-tv/">le guide de la télé</Link> vaut aussi pour un projecteur.
        </p>
      </Section>

      <Section tag="À distance" title="Une équipe en télétravail" tone="blue">
        <p>
          Le mode À distance : l'organisateur crée la salle et colle le code à 6 caractères dans le chat de la visio. Chacun
          rejoint depuis son ordinateur ou son téléphone et entend les extraits chez lui. En attendant les retardataires,
          il y a un chat et un pierre-feuille-ciseaux dans le salon. Jusqu'à 12 joueurs, l'organisateur compris.
        </p>
        <ul>
          <Li color="#f4ecdb"><span><strong>Ne partage pas le son dans la visio.</strong> Chacun a déjà l'extrait sur son appareil, le partager en plus ne fait que du décalage.</span></Li>
          <Li color="#f4ecdb"><span><strong>Fais couper les micros pendant les extraits</strong>, ou demande des écouteurs : sinon la musique de l'un revient dans le micro des autres avec une seconde de retard. On les rallume à la révélation, c'est le moment où on rigole.</span></Li>
        </ul>
        <p>
          Le détail du mode à distance est dans le guide du <Link href="/blind-test-en-ligne-gratuit/">blind test en ligne gratuit</Link>.
        </p>
      </Section>

      <Section tag="Ce qu'on montre" title="Chacun choisit ce qu'il dévoile" tone="deep">
        <p>
          Le cœur du jeu, c'est de deviner qui a mis quel morceau, et entre collègues c'est là que ça devient intéressant :
          le chef de projet qui écoute du métal, le collègue de la compta qui connaît tout Goldman. Mais personne n'est
          obligé de livrer ses écoutes.
        </p>
        <ul>
          <Li color="#486090"><span>On colle le lien qu'on veut, pas son compte : une playlist d'une dizaine de morceaux faite pour l'occasion suffit, et le jeu ne voit rien d'autre de ce qu'on écoute. Que chacun fasse la sienne, par contre. Si toute l'équipe colle la même playlist commune, chaque morceau reste au nom du premier qui l'a importé sur blindz.app et les autres n'ont plus rien à eux.</span></Li>
          <Li color="#486090"><span>On peut aussi jouer sans rien ramener, du moment qu'une personne de la salle a importé de la musique : les autres jouent sur ses morceaux. La question « qui a mis ce morceau » n'arrive qu'à partir de deux personnes qui ont ramené de la musique.</span></Li>
          <Li color="#486090"><span>Il n'y a rien à installer ni à acheter. Ça s'ouvre dans le navigateur, sur les ordinateurs du bureau comme sur les téléphones, donc pas de devis ni d'abonnement à faire valider.</span></Li>
        </ul>
      </Section>

      <Section tag="Questions" title="Ce qu'on nous demande pour les afterworks">
        <FaqList items={FAQ} />
      </Section>
    </GuideShell>
  )
}
