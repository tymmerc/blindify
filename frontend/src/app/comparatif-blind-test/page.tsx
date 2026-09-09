import type { Metadata } from "next"
import Link from "next/link"
import { AMBER, BLUE, FaqList, GuideShell, Li, Section, VERMILION, faqJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Comparatif honnete. Tout ce qui est dit des autres services vient de LEURS
// pages, lues le 8 septembre 2026 (liens en bas de chaque fiche). Quand une
// info n'a pas ete lue, on ecrit "non precise" plutot que d'inventer. Le biais
// est annonce en tete de page : c'est nous qui faisons blindz.app.

const URL = "https://blindz.app/comparatif-blind-test/"
const TITLE = "Quel blind test en ligne choisir en 2026 : blindz.app, blindtest.gg, blindz.fr, Mukiz, Tapzz, SongPop"
const DESC =
  "Comparatif honnête des blind tests en ligne en 2026 : d'où vient la musique, gratuit ou pas, compte obligatoire ou non, et lequel choisir selon ce que vous voulez faire. Sources : les sites eux-mêmes."
const UPDATED = "2026-09-08"

export const metadata: Metadata = {
  title: "Quel blind test en ligne choisir en 2026 : comparatif",
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "article", locale: "fr_FR" },
}

type Row = {
  name: string
  music: string
  own: string
  free: string
  account: string
  where: string
  players: string
  who: string
}

const ROWS: Row[] = [
  {
    name: "blindz.app",
    music: "Les playlists Spotify et Deezer de tous les joueurs, mélangées",
    own: "Oui, chaque joueur la sienne",
    free: "Gratuit, sans pub ni achat",
    account: "Non",
    where: "Navigateur (iPhone, Android, PC)",
    players: "12 par salle, 5 sur un seul tel",
    who: "Oui",
  },
  {
    name: "blindtest.gg",
    music: "Catégories du site, ou une playlist Spotify ou Deezer",
    own: "Oui, via le lien d'une playlist à la création de la partie",
    free: "Gratuit",
    account: "Non (optionnel)",
    where: "Navigateur",
    players: "Non précisé",
    who: "Non trouvé",
  },
  {
    name: "blindz.fr",
    music: "Thèmes préparés (Deezer) ; import de playlist Deezer en Premium",
    own: "En Premium seulement",
    free: "Gratuit avec pub, Premium payant",
    account: "Rejoindre : non ; créer semble demander une connexion",
    where: "Navigateur",
    players: "Jusqu'à 20",
    who: "Non trouvé",
  },
  {
    name: "Mukiz",
    music: "Playlists thématiques de l'éditeur",
    own: "Non trouvé",
    free: "Freemium (abonnement, Day Pass)",
    account: "Non précisé",
    where: "Navigateur, iOS, Android",
    players: "Jusqu'à 20 avec le Day Pass",
    who: "Non trouvé",
  },
  {
    name: "Tapzz (ex-Spotiguess)",
    music: "Ton propre compte Spotify (historique, playlists, likés)",
    own: "Oui, mais uniquement le tien, via connexion Spotify",
    free: "5 quiz par jour, puis abonnement",
    account: "Oui, un compte Spotify",
    where: "Navigateur, iOS, Android (en anglais)",
    players: "Non précisé",
    who: "Non trouvé",
  },
  {
    name: "SongPop",
    music: "Catalogue maison sous licence, packs par genre et décennie",
    own: "Non trouvé",
    free: "Freemium (SongPop Plus) ; SongPop Party via Apple Arcade",
    account: "Oui",
    where: "iOS, Android, consoles pour Party",
    players: "8 en mode Party",
    who: "Non trouvé",
  },
]

const FAQ = [
  {
    q: "Quel blind test en ligne est gratuit et sans inscription ?",
    a: "D'après leurs propres pages au 8 septembre 2026 : blindz.app (gratuit, sans pub, sans compte) et blindtest.gg (gratuit, compte optionnel). blindz.fr, Mukiz, Tapzz et SongPop ont une formule gratuite limitée et une offre payante.",
  },
  {
    q: "Quel blind test permet de jouer avec ses propres playlists Spotify ?",
    a: "Trois approches différentes. Tapzz génère un quiz depuis ton compte Spotify. blindtest.gg permet de créer une partie sur une playlist Spotify ou Deezer via son lien. blindz.app mélange les playlists de tous les joueurs de la partie, chacun collant son propre lien, sans connexion Spotify, et ajoute la question « qui a mis ce morceau ? ».",
  },
  {
    q: "blindz.app et blindz.fr, c'est le même site ?",
    a: "Non, aucun lien. blindz.fr est un site plus ancien, édité par la SAS LM Phoenix, avec des thèmes préparés et un import Deezer réservé à son offre Premium. blindz.app est un projet indépendant lancé en 2026, où la partie est générée à partir des playlists de tous les joueurs.",
  },
]

export default function Page() {
  return (
    <GuideShell
      tag="Comparatif"
      tagColor={BLUE}
      title={<>Quel blind test en ligne choisir en <em className="font-medium italic text-[#cc4830]">2026</em> ?</>}
      intro="Six services, une seule question qui tranche vraiment : d'où vient la musique, et qui la choisit. Ce comparatif est écrit par les gens qui font blindz.app, lisez-le avec ça en tête. Tout ce qui est dit des autres vient de leurs propres pages, lues le 8 septembre 2026, liens à l'appui. Quand on n'a pas trouvé l'information, on l'écrit."
      updated="8 septembre 2026"
      currentHref="/comparatif-blind-test/"
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), faqJsonLd(FAQ)]}
    >
      <Section tag="La question qui tranche" title="Trois familles de blind test">
        <ul>
          <Li color={AMBER}>
            <span><strong>Les packs de l'éditeur.</strong> Le site prépare des playlists par thème (années 80, rap, cinéma) et tout le monde joue dessus. C'est le modèle de Mukiz, de SongPop et de blindz.fr en gratuit. Efficace pour tester sa culture générale ou jouer en partie publique, mais la musique n'est pas la vôtre.</span>
          </Li>
          <Li color={BLUE}>
            <span><strong>Ton compte à toi.</strong> Le service se connecte à ton Spotify et génère un quiz sur ce que toi tu écoutes. C'est Tapzz. Personnalisé, mais centré sur une seule personne ; un mode entre amis existe, son fonctionnement n'est pas détaillé sur leur site.</span>
          </Li>
          <Li color={VERMILION}>
            <span><strong>Les playlists des joueurs.</strong> Chaque joueur colle le lien de sa playlist, et la partie mélange celles de tout le monde. blindtest.gg s'en approche (une partie se crée sur le lien d'une playlist). blindz.app va au bout : toutes les playlists des présents, et en plus il faut deviner <strong>qui a mis quoi</strong>.</span>
          </Li>
        </ul>
      </Section>

      <Section tag="Le tableau" title="Six services, sept critères" tone="deep">
        <p>« Non trouvé » veut dire que nous n'avons pas lu l'information sur le site du service, pas qu'elle n'existe pas.</p>
        <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[820px] border-collapse text-[0.95rem]">
            <thead>
              <tr className="border-b-2 border-[#2e2014] text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                <th className="py-3 pr-4">Service</th>
                <th className="py-3 pr-4">D'où vient la musique</th>
                <th className="py-3 pr-4">Vos playlists ?</th>
                <th className="py-3 pr-4">Gratuit</th>
                <th className="py-3 pr-4">Compte</th>
                <th className="py-3 pr-4">Où ça joue</th>
                <th className="py-3 pr-4">Joueurs</th>
                <th className="py-3">Qui a mis quoi</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(r => (
                <tr key={r.name} className={`border-b-2 border-[rgba(46,32,20,.18)] align-top ${r.name === "blindz.app" ? "bg-[#f4ecdb]" : ""}`}>
                  <td className="py-4 pr-4 font-display text-lg font-semibold">{r.name}</td>
                  <td className="py-4 pr-4">{r.music}</td>
                  <td className="py-4 pr-4">{r.own}</td>
                  <td className="py-4 pr-4">{r.free}</td>
                  <td className="py-4 pr-4">{r.account}</td>
                  <td className="py-4 pr-4">{r.where}</td>
                  <td className="py-4 pr-4">{r.players}</td>
                  <td className="py-4">{r.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section tag="Fiche par fiche" title="Ce que chacun fait, d'après son propre site" tone="ink">
        <h3>blindtest.gg</h3>
        <p>
          Quiz musical multijoueur en temps réel : 15 extraits de 25 secondes, il faut trouver titre et artiste le plus
          vite possible. Des catégories permanentes et tournantes, un « blindtest du jour », et des parties privées
          créées sur le lien d'une playlist Spotify ou Deezer publique. Entièrement gratuit, compte optionnel, en
          français et en anglais. Pas de mécanisme « qui a ajouté ce morceau » trouvé.{" "}
          <a href="https://blindtest.gg/faq" rel="noopener">Source : leur FAQ</a>.
        </p>
        <h3>blindz.fr</h3>
        <p>
          Blind test entre amis où le téléphone sert de buzzer, édité par la SAS LM Phoenix. Playlists thématiques
          préparées, extraits Deezer de 30 secondes, jusqu'à 20 joueurs. L'import de vos propres playlists Deezer est
          réservé au Premium (3,99 € par semaine, 4,99 € par mois ou 39,99 € par an d'après leur page abonnement), le
          gratuit comporte de la publicité.{" "}
          <a href="https://blindz.fr/abonnement" rel="noopener">Source : leur page abonnement</a>. Aucun lien avec
          blindz.app.
        </p>
        <h3>Mukiz</h3>
        <p>
          Application de blind test avec des playlists thématiques préparées par l'éditeur, en solo, en duel, en partie
          privée ou en direct, sur navigateur, iOS et Android. Freemium : accès gratuit, abonnement Premium, et un Day
          Pass de 24 h qui permet d'inviter jusqu'à 20 personnes. Pas d'import de vos playlists trouvé.{" "}
          <a href="https://mukiz.com/faq/" rel="noopener">Source : leur FAQ</a>.
        </p>
        <h3>Tapzz, anciennement Spotiguess</h3>
        <p>
          Renommé le 1er septembre 2026. Génère des quiz personnalisés à partir de ton compte Spotify (historique,
          playlists, titres likés, ou par IA). Connexion Spotify obligatoire, 5 quiz par jour en gratuit puis abonnement,
          en anglais. Le fonctionnement du mode « entre amis » n'est pas détaillé sur leur site.{" "}
          <a href="https://tapzz.com/" rel="noopener">Source : tapzz.com</a>.
        </p>
        <h3>SongPop</h3>
        <p>
          Jeu de trivia musicale sur un catalogue maison sous licence (plus de 100 000 extraits d'après l'App Store),
          organisé en packs par genre et par décennie, avec duels en ligne. Freemium avec abonnement SongPop Plus ;
          SongPop Party, jusqu'à 8 joueurs, passe par Apple Arcade et les consoles. Pas d'import de playlists
          personnelles trouvé.{" "}
          <a href="https://apps.apple.com/us/app/songpop-guess-the-song/id1528066727" rel="noopener">Source : App Store</a>.
        </p>
        <h3>blindz.app</h3>
        <p>
          Chaque joueur colle le lien de son profil ou d'une playlist publique Spotify ou Deezer, sans se connecter, et
          la partie est générée avec les morceaux de tout le monde. Un point pour le titre, un pour l'artiste, un pour
          « qui a mis quoi ». Trois façons de jouer à plusieurs : autour d'une table (écran central + QR codes), un seul téléphone à
          doigt posé, à distance avec un code ; plus un mode solo et un mode pour jouer avec sa communauté en stream. Gratuit, sans pub, sans compte, jusqu'à 12 joueurs par salle.{" "}
          <Link href="/faq/">Notre FAQ</Link>.
        </p>
      </Section>

      <Section tag="Lequel choisir" title="Selon ce que vous voulez faire" tone="amber">
        <ul>
          <Li color="#2e2014"><span><strong>Jouer sur des thèmes, en partie publique et gratuitement</strong> : blindtest.gg. Mukiz aussi, avec une app et une offre payante.</span></Li>
          <Li color="#2e2014"><span><strong>Un quiz sur ce que toi tu écoutes</strong> : Tapzz, si tu acceptes de connecter ton compte Spotify.</span></Li>
          <Li color="#2e2014"><span><strong>Un jeu mobile classique avec un gros catalogue (plus de 100 000 extraits d'après l'App Store)</strong> : SongPop.</span></Li>
          <Li color="#2e2014"><span><strong>Une soirée buzzer sur des thèmes préparés</strong> : blindz.fr, en acceptant la pub ou l'abonnement.</span></Li>
          <Li color="#2e2014"><span><strong>Une soirée sur les playlists de tous les invités, sans rien préparer, avec « qui a mis quoi »</strong> : blindz.app. C'est le seul cas où on se recommande sans réserve, et c'est précisément pour ça qu'on l'a fait.</span></Li>
        </ul>
        <p>
          Une information fausse ou dépassée dans ce comparatif ? Écrivez-nous depuis la page{" "}
          <Link href="/mentions-legales/">mentions légales</Link>, on corrige.
        </p>
      </Section>

      <Section tag="Questions" title="Ce qu'on nous demande sur les autres blind tests">
        <FaqList items={FAQ} />
      </Section>
    </GuideShell>
  )
}
