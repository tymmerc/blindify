import type { Metadata } from "next"
import Link from "next/link"
import { AMBER, BLUE, FaqList, GuideShell, Li, Section, VERMILION, faqJsonLd, webPageJsonLd } from "@/components/home/Guide"

// Comparatif honnete. Tout ce qui est dit des autres services vient de LEURS
// pages, lues le 8 septembre 2026 (liens en bas de chaque fiche). Blinest,
// ajoute le 5 octobre 2026, a ete lu ce jour-la (FAQ, pages de categorie,
// accueil, mini-jeux, depot GitHub) ; les autres n'ont pas ete relus. Quand une
// info n'a pas ete lue, on ecrit "non precise" plutot que d'inventer. Le biais
// est annonce en tete de page : c'est nous qui faisons blindz.app. Pas de
// recommandation vers un concurrent (regle de Tym) : la page dit quand
// blindz.app est le bon choix, et decrit les autres tels qu'ils se presentent.

const URL = "https://blindz.app/comparatif-blind-test/"
const TITLE = "Quel blind test en ligne choisir en 2026 : blindz.app, Blinest, blindtest.gg, blindz.fr, Mukiz, Tapzz, SongPop"
const DESC =
  "Comparatif honnête des blind tests en ligne en 2026, Blinest, blindtest.gg, Mukiz et SongPop compris : d'où vient la musique, gratuit ou pas, compte obligatoire ou non, et lequel choisir selon ce que vous voulez faire. Sources : les sites eux-mêmes."
const UPDATED = "2026-10-05"

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
    name: "Blinest",
    music: "Salles thématiques officielles et salles créées par les joueurs",
    own: "Oui, importées par le créateur de la room (Spotify, Deezer, Apple Music)",
    free: "Gratuit, avec pub (coupée les mois où les dons suffisent)",
    account: "Rejoindre : non (invité) ; créer une room : oui",
    where: "Navigateur (ordinateur et mobile)",
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
    a: "D'après leurs propres pages, lues le 8 septembre 2026 (le 5 octobre pour Blinest) : blindz.app (gratuit, sans pub, sans compte) et blindtest.gg (gratuit, compte optionnel). Blinest est gratuit aussi, avec de la publicité, et on peut y rejoindre une room en invité, mais créer une room ou une playlist demande un compte. blindz.fr, Mukiz, Tapzz et SongPop ont une formule gratuite limitée et une offre payante.",
  },
  {
    q: "Quel blind test permet de jouer avec ses propres playlists Spotify ?",
    a: "Plusieurs approches. Tapzz génère un quiz depuis ton compte Spotify. blindtest.gg permet de créer une partie sur une playlist Spotify ou Deezer via son lien. Sur Blinest, on importe une playlist publique Spotify, Deezer ou Apple Music dans une playlist Blinest, avec un compte, puis on la rattache à une room. blindz.app mélange les playlists de tous les joueurs de la partie, chacun collant son propre lien, sans connexion Spotify, et ajoute la question « qui a mis ce morceau ? ».",
  },
  {
    q: "Quelle alternative à Blinest pour jouer entre amis avec ses propres playlists ?",
    a: "Blinest permet aussi de jouer sur sa musique : avec un compte, on crée une playlist Blinest à partir d'une playlist publique Spotify, Deezer ou Apple Music, on la rattache à une room, puis on y fait venir ses amis (un mot de passe garde la room privée). Sur blindz.app, il n'y a rien à monter avant : à plusieurs téléphones, chacun colle le lien de son profil ou d'une playlist publique Spotify ou Deezer au moment de jouer, sans compte, la partie mélange la musique de toute la bande, et un point de plus va à qui devine lequel de ses potes a ramené le morceau. On y joue autour d'une table (la télé diffuse, chacun répond sur son téléphone), à distance avec un code ou sur un seul téléphone, et il n'y a pas de pub. Ce qui est dit de Blinest vient de ses pages, lues le 5 octobre 2026.",
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
      intro="Sept services, une seule question qui tranche vraiment : d'où vient la musique, et qui la choisit. Ce comparatif est écrit par les gens qui font blindz.app, lisez-le avec ça en tête. Tout ce qui est dit des autres vient de leurs propres pages, lues le 8 septembre 2026 (le 5 octobre 2026 pour Blinest), liens à l'appui. Quand on n'a pas trouvé l'information, on l'écrit."
      updated="5 octobre 2026"
      currentHref="/comparatif-blind-test/"
      jsonLd={[webPageJsonLd(URL, TITLE, DESC, UPDATED), faqJsonLd(FAQ)]}
    >
      <Section tag="La question qui tranche" title="Trois familles de blind test">
        <ul>
          <Li color={AMBER}>
            <span><strong>Les packs de l'éditeur.</strong> Le site prépare des playlists par thème (années 80, rap, cinéma) et tout le monde joue dessus. C'est le modèle de Mukiz, de SongPop, de blindz.fr en gratuit et des salles officielles de Blinest. Efficace pour tester sa culture générale ou jouer en partie publique, mais la musique n'est pas la vôtre.</span>
          </Li>
          <Li color={BLUE}>
            <span><strong>Ton compte à toi.</strong> Le service se connecte à ton Spotify et génère un quiz sur ce que toi tu écoutes. C'est Tapzz. Personnalisé, mais centré sur une seule personne ; un mode entre amis existe, son fonctionnement n'est pas détaillé sur leur site.</span>
          </Li>
          <Li color={VERMILION}>
            <span><strong>Les playlists des joueurs.</strong> Chaque joueur colle le lien de sa playlist, et la partie mélange celles de tout le monde. blindtest.gg et Blinest s'en approchent : on peut y jouer sur une playlist importée, mais c'est la personne qui crée la partie (ou la room) qui la choisit, pas chaque joueur. blindz.app va au bout : toutes les playlists des présents, et en plus il faut deviner <strong>qui a mis quoi</strong>.</span>
          </Li>
        </ul>
      </Section>

      <Section tag="Le tableau" title="Sept services, sept critères" tone="deep">
        <p>« Non trouvé » veut dire que nous n'avons pas lu l'information sur le site du service, pas qu'elle n'existe pas.</p>
        {/* A 390 px le tableau defile dans son cadre : la colonne Service reste
            collee a gauche pour savoir de qui on lit la ligne. La marge de 20 px
            est portee par les cellules du bord, pas par le cadre, sinon la
            cellule collee viendrait toucher le bord de l'ecran. */}
        <div className="-mx-5 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[820px] border-collapse text-[0.95rem]">
            <thead>
              <tr className="border-b-2 border-[#2e2014] text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                <th className="sticky left-0 z-[1] bg-[#ece1c8] py-3 pl-5 pr-4 shadow-[1px_0_0_rgba(46,32,20,.18)] sm:static sm:pl-0 sm:shadow-none">Service</th>
                <th className="py-3 pr-4">D'où vient la musique</th>
                <th className="py-3 pr-4">Vos playlists ?</th>
                <th className="py-3 pr-4">Gratuit</th>
                <th className="py-3 pr-4">Compte</th>
                <th className="py-3 pr-4">Où ça joue</th>
                <th className="py-3 pr-4">Joueurs</th>
                <th className="py-3 pr-5 sm:pr-0">Qui a mis quoi</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(r => {
                // Fond explicite sur la ligne ET sur la cellule collee, qui doit masquer ce qui defile dessous.
                const bg = r.name === "blindz.app" ? "bg-[#f4ecdb]" : "bg-[#ece1c8]"
                return (
                  <tr key={r.name} className={`border-b-2 border-[rgba(46,32,20,.18)] align-top ${bg}`}>
                    <td className={`sticky left-0 z-[1] ${bg} py-4 pl-5 pr-4 font-display text-lg font-semibold shadow-[1px_0_0_rgba(46,32,20,.18)] sm:static sm:pl-0 sm:shadow-none`}>{r.name}</td>
                    <td className="py-4 pr-4">{r.music}</td>
                    <td className="py-4 pr-4">{r.own}</td>
                    <td className="py-4 pr-4">{r.free}</td>
                    <td className="py-4 pr-4">{r.account}</td>
                    <td className="py-4 pr-4">{r.where}</td>
                    <td className="py-4 pr-4">{r.players}</td>
                    <td className="py-4 pr-5 sm:pr-0">{r.who}</td>
                  </tr>
                )
              })}
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
          <a href="https://blindtest.gg/faq" rel="noopener nofollow">Source : leur FAQ</a>.
        </p>
        <h3>Blinest</h3>
        <p>
          Quiz musical multijoueur en temps réel, organisé en « rooms » : des salles officielles par thème (années 80,
          Disney, chanson française, rap...) et des salles créées par les joueurs, ouvertes à tous ou protégées par un
          mot de passe pour jouer entre amis. On tape le titre ou l'artiste, et plus on répond vite, plus on marque
          (bonus de vitesse, bonus pour les trois premiers), avec classements, niveaux, ELO et équipes, plus des
          mini-jeux en solo. Pour jouer sur sa propre musique, on crée une playlist Blinest, connecté à son compte, en
          important une playlist publique Spotify, Deezer ou Apple Music (ou titre par titre), puis on la rattache à
          une room. On peut rejoindre une room en invité ; créer une room ou une playlist demande un compte. Gratuit,
          avec de la publicité et un objectif de dons mensuel : quand il est atteint, la pub est coupée pour tout le
          monde jusqu'au mois suivant. Dans le navigateur, sur ordinateur et mobile, en français, anglais et espagnol. C'est un site
          personnel tenu par un développeur seul, avec des modérateurs bénévoles, et son code est ouvert. Nombre de
          joueurs par room non précisé, pas de mécanisme « qui a ajouté ce morceau » trouvé. Sources :{" "}
          <a href="https://blinest.com/docs/faq" rel="noopener nofollow">leur FAQ</a>,{" "}
          <a href="https://blinest.com/blind-test-univers-musicaux" rel="noopener nofollow">une page de catégorie</a>,{" "}
          <a href="https://blinest.com/" rel="noopener nofollow">leur accueil</a> (dons et pub),{" "}
          <a href="https://blinest.com/minigames" rel="noopener nofollow">les mini-jeux</a> et{" "}
          <a href="https://github.com/mchev/blinest" rel="noopener nofollow">le code sur GitHub</a>.
        </p>
        <h3>blindz.fr</h3>
        <p>
          Blind test entre amis où le téléphone sert de buzzer, édité par la SAS LM Phoenix. Playlists thématiques
          préparées, extraits Deezer de 30 secondes, jusqu'à 20 joueurs. L'import de vos propres playlists Deezer est
          réservé au Premium (3,99 € par semaine, 4,99 € par mois ou 39,99 € par an d'après leur page abonnement), le
          gratuit comporte de la publicité.{" "}
          <a href="https://blindz.fr/abonnement" rel="noopener nofollow">Source : leur page abonnement</a>. Aucun lien avec
          blindz.app.
        </p>
        <h3>Mukiz</h3>
        <p>
          Application de blind test avec des playlists thématiques préparées par l'éditeur, en solo, en duel, en partie
          privée ou en direct, sur navigateur, iOS et Android. Freemium : accès gratuit, abonnement Premium, et un Day
          Pass de 24 h qui permet d'inviter jusqu'à 20 personnes. Pas d'import de vos playlists trouvé.{" "}
          <a href="https://mukiz.com/faq/" rel="noopener nofollow">Source : leur FAQ</a>.
        </p>
        <h3>Tapzz, anciennement Spotiguess</h3>
        <p>
          Renommé le 1er septembre 2026. Génère des quiz personnalisés à partir de ton compte Spotify (historique,
          playlists, titres likés, ou par IA). Connexion Spotify obligatoire, 5 quiz par jour en gratuit puis abonnement,
          en anglais. Le fonctionnement du mode « entre amis » n'est pas détaillé sur leur site.{" "}
          <a href="https://tapzz.com/" rel="noopener nofollow">Source : tapzz.com</a>.
        </p>
        <h3>SongPop</h3>
        <p>
          Jeu de trivia musicale sur un catalogue maison sous licence (plus de 100 000 extraits d'après l'App Store),
          organisé en packs par genre et par décennie, avec duels en ligne. Freemium avec abonnement SongPop Plus ;
          SongPop Party, jusqu'à 8 joueurs, passe par Apple Arcade et les consoles. Pas d'import de playlists
          personnelles trouvé.{" "}
          <a href="https://apps.apple.com/us/app/songpop-guess-the-song/id1528066727" rel="noopener nofollow">Source : App Store</a>.
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

      <Section tag="Quand choisir blindz.app" title="Ce qu'on fait que les autres ne font pas" tone="amber">
        <ul>
          <Li color="#2e2014"><span><strong>Les playlists de tous les joueurs, mélangées</strong> : chacun colle son lien Spotify ou Deezer, sans se connecter, et la partie se joue sur la musique de toute la bande.</span></Li>
          <Li color="#2e2014"><span><strong>Deviner qui a mis quoi</strong> : un point de plus pour qui trouve lequel de ses potes a ramené le morceau. C'est ce qui fait rire la table.</span></Li>
          <Li color="#2e2014"><span><strong>Autour d'une table</strong> : la télé ou un PC diffuse la musique, chacun répond sur son téléphone en scannant un QR code, jusqu'à 12 joueurs.</span></Li>
          <Li color="#2e2014"><span><strong>Rien à préparer</strong> : pas de pack à choisir, pas de quiz à écrire. Un pseudo, un lien, et la partie est prête.</span></Li>
          <Li color="#2e2014"><span><strong>Vraiment gratuit</strong> : sans pub, sans abonnement, sans compte, sur iPhone, Android et PC.</span></Li>
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
