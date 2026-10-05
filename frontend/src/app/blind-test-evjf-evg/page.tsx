import type { Metadata } from "next"
import Link from "next/link"
import { FaqList, GuideShell, Li, Section, VERMILION, faqJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Guide "blind test EVJF / EVG" (une seule page : le deroule est le meme pour
// les deux). Verifie dans le code (05/10/2026) : 12 places par salle, hote
// compris (roomsController, room_full) ; pseudo jusqu'a 30 caracteres ; la
// musique importee reste dans la bibliotheque du joueur (audio_sources, cookie
// invite d'un an) ; jeu en ligne seulement, il faut du reseau.

const URL = "https://blindz.app/blind-test-evjf-evg/"
const TITLE = "Blind test pour un EVJF ou un EVG : la vie de la future mariée ou du futur marié en chansons"
const DESC =
  "Un blind test pour un EVJF ou un EVG, sans rien préparer : sa vie en chansons avec les playlists de la bande, le réseau au gîte, et comment jouer à plus de 12."
const UPDATED = "2026-10-05"

export const metadata: Metadata = {
  title: "Blind test pour un EVJF ou un EVG",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

const FAQ = [
  {
    q: "Il faut que tout le monde crée un compte ?",
    a: "Non. Un pseudo et un lien de playlist suffisent, sur iPhone, Android ou ordinateur, dans le navigateur. Personne n'installe rien.",
  },
  {
    q: "On peut jouer sans réseau au gîte ?",
    a: "Non, blindz.app se joue en ligne : chaque téléphone a besoin du wifi ou de la 4G, et l'écran central aussi pour diffuser les extraits.",
  },
  {
    q: "Il n'y a pas de télé là où on dort.",
    a: "Le téléphone d'un témoin posé au milieu de la table fait l'écran central, avec une enceinte Bluetooth pour le son. À cinq ou moins, le mode un seul tel suffit : tout le monde pose un doigt sur le même téléphone.",
  },
  {
    q: "Le jeu peut donner des gages ?",
    a: "Non, il compte les points et c'est tout : un point pour le titre, un pour l'artiste, un pour avoir deviné qui a mis le morceau. Les gages, c'est à vous de les inventer, par exemple pour le dernier du classement à chaque partie.",
  },
]

export default function Page() {
  return (
    <GuideShell
      tag="Guide EVJF et EVG"
      tagColor={VERMILION}
      title={<>Un blind test pour un <em className="font-medium italic text-[#cc4830]">EVJF</em> ou un <em className="font-medium italic text-[#cc4830]">EVG</em></>}
      intro="Un enterrement de vie de jeune fille ou de garçon, c'est souvent un gîte, une bande qui ne se connaît que par morceaux (les amis d'enfance, ceux de la fac, la sœur, les collègues) et une personne à mettre au centre. Un blind test fait avec la musique de tout ce monde tient très bien dans ce cadre, surtout si on le tourne vers elle."
      updated="5 octobre 2026"
      currentHref="/blind-test-evjf-evg/"
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), faqJsonLd(FAQ)]}
    >
      <Section tag="Le principe" title="Sa vie en chansons, chacun sa part">
        <p>
          Dans le message d'organisation, demande à chaque participant de faire une playlist publique de cinq à dix
          morceaux liés à la future mariée ou au futur marié : la chanson de votre rencontre, l'hymne de ses dix-huit ans,
          ce qu'il passait en boucle pendant ses partiels, le slow honteux d'une boum. Sur place, chacun colle son lien et
          la partie mélange tout.
        </p>
        <p>
          À chaque manche, la table cherche le titre et l'artiste, puis qui a mis ce morceau. C'est là qu'un EVJF devient
          drôle : les amis d'enfance découvrent les souvenirs des collègues, et la personne qu'on enterre doit expliquer
          d'où sort ce slow de Lorie que quelqu'un a gardé depuis la cinquième.
        </p>
        <ul>
          <Li><span><strong>La future mariée joue aussi.</strong> Elle ne ramène pas de playlist souvenirs (elle connaît les réponses), mais elle cherche avec les autres. Si elle ne reconnaît pas la chanson de votre rencontre, vous aurez de quoi en parler.</span></Li>
          <Li><span><strong>Préparez les liens avant de partir.</strong> Chacun peut coller le sien la veille, depuis le téléphone qu'il emportera : la musique importée reste dans sa bibliothèque, et sur place il n'aura plus qu'à rejoindre la salle.</span></Li>
          <Li><span><strong>Il faut au moins deux playlists</strong> pour que la question « qui a mis ce morceau » apparaisse.</span></Li>
        </ul>
        <p>
          Pour trouver le bon lien : <Link href="/blind-test-spotify/">sur Spotify</Link> ou{" "}
          <Link href="/blind-test-deezer/">sur Deezer</Link>, les deux se mélangent dans la même partie.
        </p>
      </Section>

      <Section tag="Au gîte" title="Ce qu'il faut sur place" tone="ink">
        <ul>
          <Li color="#d88418"><span><strong>Du réseau.</strong> Wifi du gîte ou 4G, sur chaque téléphone. Si la maison est en zone blanche, mieux vaut le savoir avant.</span></Li>
          <Li color="#d88418"><span><strong>Un écran central.</strong> La télé du gîte avec un ordinateur branché en HDMI, ou le téléphone d'un témoin posé au milieu. Les solutions pour la télé sont dans <Link href="/blind-test-tv/">le guide du blind test sur la télé</Link>.</span></Li>
          <Li color="#d88418"><span><strong>Une enceinte.</strong> La musique ne sort que de l'écran central, et quinze personnes qui parlent couvrent vite un haut-parleur de téléphone.</span></Li>
          <Li color="#d88418"><span><strong>Quelqu'un qui présente.</strong> Le témoin qui organise choisit Je présente seulement : son écran gère la musique et les scores, il peut mettre en pause pendant qu'on ressert les verres.</span></Li>
        </ul>
      </Section>

      <Section tag="Plus de 12" title="Quand la bande est trop grande pour une salle" tone="amber">
        <p>
          Une salle a 12 places, et l'écran central en prend une s'il présente seulement : 11 joueurs qui répondent. Un EVJF
          à quinze dépasse vite. Deux façons de faire :
        </p>
        <ul>
          <Li color="#2e2014"><span><strong>Les binômes.</strong> Un téléphone pour deux, avec un pseudo commun (« Julie et Sam »). Vingt-deux personnes tiennent dans une salle, et devoir se mettre d'accord avant de taper fait partie du jeu.</span></Li>
          <Li color="#2e2014"><span><strong>Deux salles.</strong> Deux écrans, deux codes, chacune son classement. Pratique si le groupe se partage de toute façon entre deux pièces.</span></Li>
        </ul>
        <p>
          Dans les deux cas, pensez aux manches : chacune joue le morceau d'une seule personne. Avec beaucoup de
          playlists, prenez 15 ou 20 manches pour que tout le monde passe.
        </p>
      </Section>

      <Section tag="Questions" title="Ce qu'on nous demande pour les EVJF et EVG">
        <FaqList items={FAQ} />
      </Section>
    </GuideShell>
  )
}
