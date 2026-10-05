import type { Metadata } from "next"
import Link from "next/link"
import { AMBER, FaqList, GuideShell, Li, Section, Steps, faqJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Guide "blind test d'anniversaire". Verifie dans le code (05/10/2026) :
// - manches reparties en tourniquet entre ceux qui ont ramene de la musique,
//   ecart max 1 tant que chacun a de quoi remplir sa part (roomsController) ;
//   titres sans extrait ecartes au lancement ;
// - une seule personne avec de la musique suffit pour lancer, "qui a mis quoi"
//   a partir de deux importeurs distincts (COUNT(DISTINCT user_id)) ;
// - un titre appartient au PREMIER qui l'a importe, sur tout le site
//   (audio_sources unique par provider + external_id) : meme playlist collee
//   deux fois ou classique deja importe = rien pour le second. Dit dans la page ;
// - 12 places par salle, hote compris ; l'ecran central affiche "Propose par"
//   a la revelation (MultiplayerGameClient, mode event) ;
// - un seul tel : toute la bibliotheque du telephone, titres joues dans les
//   12 h mis de cote, complement pris au hasard dans le fonds du site
//   (gamesController.startSoloGame).

const URL = "https://blindz.app/blind-test-anniversaire/"
const TITLE = "Blind test d'anniversaire : avec la musique des invités, et des souvenirs de la personne fêtée"
const DESC =
  "Un blind test d'anniversaire avec la musique des invités : l'idée de la playlist souvenirs, comment lancer la partie, combien de joueurs, la version enfants."
const UPDATED = "2026-10-05"

export const metadata: Metadata = {
  title: "Blind test d'anniversaire et playlist souvenirs",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const DAY_STEPS = [
  {
    t: "Un écran au milieu",
    b: (
      <>
        La télé, un ordinateur ou simplement un téléphone avec une enceinte, en mode Autour d'une table. Si tu veux la
        télé, <Link href="/blind-test-tv/">le guide de la télé</Link> explique comment la brancher.
      </>
    ),
  },
  {
    t: "Quelqu'un d'autre présente",
    b: "Celui qui organise choisit Je présente seulement : son écran diffuse la musique et les scores, et la personne fêtée joue avec les autres au lieu de s'occuper de la technique.",
  },
  {
    t: "Les invités scannent le QR code",
    b: "Chacun colle le lien de sa playlist souvenirs. Ceux qui n'en ont pas fait jouent quand même, sur les morceaux des autres.",
  },
  {
    t: "Assez de manches pour tout le monde",
    b: "Chaque manche joue le morceau d'une seule personne. Si dix invités ont ramené de la musique, prends 15 ou 20 manches, sinon certains souvenirs ne passeront jamais.",
  },
]

const FAQ = [
  {
    q: "La personne fêtée n'a ni Spotify ni Deezer, elle peut jouer ?",
    a: "Oui. Pour lancer une partie, il suffit qu'une personne dans la salle ait ramené de la musique. Les autres jouent sur ces morceaux-là, sans compte et sans rien installer.",
  },
  {
    q: "On peut utiliser une playlist que quelqu'un d'autre a faite ?",
    a: "Oui, si elle est publique sur Spotify ou Deezer. Mais pour le jeu, un morceau appartient à la première personne qui l'a importé sur blindz.app. Sur une playlist très écoutée, une partie des titres a peut-être déjà été ramenée par un autre joueur du site, et ceux-là ne compteront pas dans ta musique. Une playlist faite à la main pour l'occasion évite la surprise.",
  },
  {
    q: "Combien de temps dure une partie ?",
    a: "Cinq à dix minutes pour dix manches de 20 secondes, révélations comprises. L'hôte relance une partie dans la même salle quand il veut, sans que personne ait à rescanner.",
  },
  {
    q: "On est plus de 12, comment on fait ?",
    a: "L'écran central occupe déjà une des 12 places de la salle. Au-delà, ouvre une deuxième salle sur un deuxième écran (chacune a son classement), ou mets les invités en binômes : un téléphone pour deux, ça oblige à se mettre d'accord avant de taper.",
  },
]

export default function Page() {
  return (
    <GuideShell
      tag="Guide anniversaire"
      tagColor={AMBER}
      title={<>Un blind test pour un <em className="font-medium italic text-[#cc4830]">anniversaire</em></>}
      intro="Le principe reste celui d'une soirée normale : chaque invité ramène sa playlist et la partie se fabrique toute seule. Sauf qu'ici il y a quelqu'un à fêter. Voilà comment tourner le blind test vers lui ou vers elle, pour qu'on ne parle pas seulement de musique."
      updated="5 octobre 2026"
      currentHref="/blind-test-anniversaire/"
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), faqJsonLd(FAQ)]}
    >
      <Section tag="L'idée qui marche" title="La playlist souvenirs">
        <p>
          Quelques jours avant, demande à chaque invité de faire une petite playlist publique avec des morceaux qui lui
          rappellent la personne fêtée : la chanson du voyage de terminale, celle de leur premier concert ensemble, le
          tube qu'elle chante faux dans la voiture depuis quinze ans. Le jour J, chacun colle le lien de cette
          playlist-là plutôt que la sienne.
        </p>
        <p>
          À chaque manche, il faut trouver le titre et l'artiste, puis deviner qui a mis le morceau. Avec des playlists
          souvenirs, cette dernière question change de sens : ce n'est plus « qui écoute ça », c'est « qui a ce souvenir
          avec toi ». À la révélation, l'écran central affiche le nom de celui qui l'a ajouté, et c'est en général là que
          l'histoire sort.
        </p>
        <ul>
          <Li><span><strong>Personne ne monopolise la partie.</strong> Les manches sont réparties à tour de rôle entre ceux qui ont ramené de la musique : celui qui a mis 40 titres n'en aura pas plus que celui qui en a mis 10, à un morceau près. Ça suppose que chacun ait de quoi remplir sa part. Un invité qui n'a que trois morceaux jouables en placera trois, et les autres compléteront.</span></Li>
          <Li><span><strong>Chacun fait sa propre liste.</strong> Sur blindz.app, un morceau reste au nom de la première personne qui l'a importé, sur tout le site. Si deux invités collent la même playlist, le second n'a aucun morceau à lui, et un grand classique qu'un autre joueur a déjà ramené un jour ne comptera pas non plus.</span></Li>
          <Li><span><strong>Mets-en un peu plus que prévu.</strong> Un titre sans extrait disponible est écarté au lancement. Une dizaine de morceaux chacun laisse de la marge.</span></Li>
          <Li><span><strong>La personne fêtée peut ramener la sienne aussi.</strong> Ses propres morceaux passent alors au milieu des souvenirs des autres, et c'est à la table de les reconnaître.</span></Li>
          <Li><span><strong>Il faut au moins deux personnes qui ont ramené de la musique</strong> pour que la question « qui a mis ce morceau » apparaisse. Avec une seule, on joue au titre et à l'artiste.</span></Li>
        </ul>
        <p>
          Pour copier le bon lien : <Link href="/blind-test-spotify/">côté Spotify</Link>,{" "}
          <Link href="/blind-test-deezer/">côté Deezer</Link>. La playlist doit être publique, c'est la cause numéro un
          de « mon lien ne marche pas ».
        </p>
      </Section>

      <Section tag="Le jour J" title="Lancer la partie pendant que le gâteau attend" tone="ink">
        <Steps light items={DAY_STEPS} />
        <p>
          Le déroulé détaillé d'une partie (réglages, retardataires, écran qui reste allumé) est dans le{" "}
          <Link href="/blind-test-soiree/">guide de la soirée</Link>, il ne change pas pour un anniversaire.
        </p>
      </Section>

      <Section tag="Pour les enfants" title="Un anniversaire d'enfants, sur un seul téléphone" tone="amber">
        <p>
          Les enfants n'ont en général ni téléphone ni compte Spotify. Le mode un seul tel est fait pour ça : un parent
          importe sur son téléphone une playlist des chansons que les enfants connaissent (dessins animés, comptines, les
          tubes du moment), et jusqu'à 5 joueurs posent chacun un doigt sur l'écran.
        </p>
        <p>
          Une chose à savoir avant : ce mode joue toute la musique importée sur ce téléphone, pas seulement la playlist du
          jour. S'il a déjà servi pour une soirée entre adultes, ces morceaux-là peuvent revenir au milieu des comptines,
          alors prends un téléphone (ou un navigateur) qui n'a jamais servi sur blindz.app.
        </p>
        <p>
          Prévois aussi large. Les morceaux joués dans les douze dernières heures sont mis de côté, un tube déjà importé
          par un autre joueur du site ne rejoint pas la bibliothèque du téléphone, et quand il n'y a plus assez de
          morceaux, le jeu complète avec le fonds commun de blindz.app, qui n'a rien de spécial pour les enfants. Pour
          deux ou trois parties, une playlist de trente ou quarante chansons n'est pas de trop.
        </p>
        <ul>
          <Li color="#2e2014"><span>La musique démarre quand tous les doigts sont posés. Le premier qui lâche prend le téléphone et tape sa réponse.</span></Li>
          <Li color="#2e2014"><span>Titre et artiste : 3 points, l'un des deux seulement : 1 point. Parties de 5, 10 ou 15 manches, et 5 manches suffisent aux plus petits.</span></Li>
          <Li color="#2e2014"><span>La correction tolère les fautes de frappe et les accents oubliés, ce qui aide beaucoup à huit ans.</span></Li>
          <Li color="#2e2014"><span>Plus de cinq enfants ? On fait tourner les équipes entre deux parties.</span></Li>
        </ul>
      </Section>

      <Section tag="Questions" title="Ce qu'on nous demande pour les anniversaires">
        <FaqList items={FAQ} />
      </Section>
    </GuideShell>
  )
}
