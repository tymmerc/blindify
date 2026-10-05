import type { Metadata } from "next"
import Link from "next/link"
import { AMBER, FaqList, GuideShell, Li, Section, Steps, faqJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Guide "blind test d'anniversaire". Verifie dans le code (05/10/2026) : manches
// reparties a parts egales entre ceux qui ont ramene de la musique, ecart max 1
// (roomsController, tourniquet) ; titres sans extrait ecartes ; une seule
// playlist suffit pour lancer, "qui a mis quoi" seulement a partir de deux
// importeurs ; 12 places par salle, hote compris ; l'ecran central affiche
// "Ajoute par" a la revelation (TheaterGameView).

const URL = "https://blindz.app/blind-test-anniversaire/"
const TITLE = "Blind test d'anniversaire : avec la musique des invités, et des souvenirs de la personne fêtée"
const DESC =
  "Un blind test d'anniversaire avec la musique des invités : l'idée de la playlist souvenirs, comment lancer la partie, combien de joueurs, la version enfants."
const UPDATED = "2026-10-05"

export const metadata: Metadata = {
  title: "Blind test d'anniversaire avec la musique des invités",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const DAY_STEPS = [
  {
    t: "Un écran au milieu",
    b: (
      <>
        La télé, un ordinateur ou simplement un téléphone avec une enceinte, en mode Autour d'une table. Pour brancher la
        télé, voir <Link href="/blind-test-tv/">le guide du blind test sur la télé</Link>.
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
    b: "Chaque manche joue le morceau d'une seule personne. À dix invités qui ont ramené de la musique, prenez 15 ou 20 manches, sinon certains souvenirs ne passeront jamais.",
  },
]

const FAQ = [
  {
    q: "La personne fêtée n'a ni Spotify ni Deezer, elle peut jouer ?",
    a: "Oui. Pour lancer une partie, il suffit qu'une personne dans la salle ait importé de la musique. Les autres jouent sur ces morceaux-là, sans compte et sans rien installer.",
  },
  {
    q: "On peut utiliser une playlist que quelqu'un d'autre a faite ?",
    a: "Oui, n'importe quelle playlist publique Spotify ou Deezer. Pour la question « qui a mis ce morceau », elle compte comme celle du joueur qui a collé le lien.",
  },
  {
    q: "Combien de temps dure une partie ?",
    a: "Cinq à dix minutes pour dix manches de 20 secondes, révélations comprises. L'hôte relance une partie dans la même salle quand il veut, sans que personne ait à rescanner.",
  },
  {
    q: "On est plus de 12, comment on fait ?",
    a: "Une salle a 12 places, et l'écran central en prend une s'il présente seulement. Au-delà, ouvrez deux salles sur deux écrans (chacune a son classement), ou jouez en binômes : un téléphone pour deux, ça oblige à se mettre d'accord avant de taper.",
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
          rappellent la personne fêtée : la chanson du voyage de terminale, celle de votre premier concert, le tube
          qu'elle chante faux dans la voiture depuis quinze ans. Le jour J, chacun colle le lien de cette playlist-là
          plutôt que la sienne.
        </p>
        <p>
          À chaque manche, il faut trouver le titre et l'artiste, puis deviner qui a mis le morceau. Avec des playlists
          souvenirs, cette dernière question change de sens : ce n'est plus « qui écoute ça », c'est « qui a ce souvenir
          avec toi ». À la révélation, l'écran central affiche le nom de celui qui l'a ajouté, et c'est en général là que
          l'histoire sort.
        </p>
        <ul>
          <Li><span><strong>Personne ne monopolise la partie.</strong> Les manches sont réparties à parts égales entre ceux qui ont ramené de la musique, à un morceau près, même si l'un a mis 40 titres et l'autre 8.</span></Li>
          <Li><span><strong>Mettez-en un peu plus que prévu.</strong> Un titre sans extrait disponible est écarté au lancement. Une dizaine de morceaux chacun laisse de la marge.</span></Li>
          <Li><span><strong>La personne fêtée peut ramener la sienne aussi.</strong> Ses propres morceaux passent alors au milieu des souvenirs des autres, et c'est à la table de les reconnaître.</span></Li>
          <Li><span><strong>Il faut au moins deux playlists</strong> pour que la question « qui a mis ce morceau » apparaisse. Avec une seule, on joue au titre et à l'artiste.</span></Li>
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
