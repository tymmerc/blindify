import type { Metadata } from "next"
import Link from "next/link"
import { publicPath } from "@/lib/publicPath"
import { ScrollVinyl } from "@/components/home/ScrollVinyl"
import { ModesStage } from "@/components/home/ModesStage"
import { SiteHeader, SiteFooter } from "@/components/home/SiteChrome"
import { FaqAccordion } from "@/components/home/FaqAccordion"

// Landing de blindz.app. Composant SERVEUR : tout le texte est dans le HTML
// pre-rendu (export statique), c'est ce que lisent Google, Bing, Brave et
// donc ChatGPT, Claude, Perplexity. Les seuls ilots client sont le disque
// pilote par le scroll et le split-screen des modes.
// Le wizard de jeu (pseudo, lien, creer/rejoindre) vit sur /jouer/.
//
// Palette : celle du logo (cle de sol) : vermillon, ambre, sauge, bleu acier,
// sur encre et papier. Chaque bloc prend une couleur, le texte reste toujours
// en encre pleine ou en creme pour la lisibilite (contrastes verifies AA).
//
// Veracite : chaque chiffre et chaque promesse ci-dessous a ete verifie contre
// le code (limites de salle roomsController, scoring realtimeGame, buzzer
// local, cookie invite d'un an). Ne pas gonfler.

const TITLE = "blindz.app · Le blind test avec vos playlists Spotify et Deezer"
const DESC =
  "blindz.app génère un blind test avec les playlists Spotify ou Deezer des joueurs, sans pack imposé ni quiz à préparer. À table, sur un seul tel ou à distance, gratuit et sans compte."

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: "https://blindz.app/" },
  openGraph: { title: TITLE, description: DESC, url: "https://blindz.app/", type: "website", locale: "fr_FR" },
  twitter: { card: "summary", title: TITLE, description: DESC },
}

// Couleurs du logo
const INK = "#2e2014"
const CREAM = "#f4ecdb"
const VERMILION = "#cc4830"
const AMBER = "#d88418"
const BLUE = "#486090"

// Etiquette de section : encre + pastille de couleur (lisible a 11px, la
// couleur est portee par la pastille, pas par le texte).
function Tag({ color, children, light }: { color: string; children: React.ReactNode; light?: boolean }) {
  return (
    <p className={`flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.26em] ${light ? "text-[#f4ecdb]" : "text-[#2e2014]"}`}>
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {children}
    </p>
  )
}

// Les QR "Autour d'une table" (affiches imprimees comprises) pointent /?join=CODE.
// Redirection en script inline, AVANT l'hydratation React : pas de flash de la
// landing, pas de code perdu si on tape "Jouer" trop vite. publicPath gere le
// basePath (dev /blindify, prod racine).
const JOUER = publicPath("/jouer/")
const JOIN_REDIRECT = `(function(){try{var m=/[?&]join=([A-Za-z0-9]+)/.exec(location.search);if(m){location.replace(${JSON.stringify(JOUER)}+"?join="+m[1].toUpperCase())}}catch(e){}})();`

const MODES = [
  {
    key: "table",
    num: "01",
    color: VERMILION,
    title: "Autour d'une table",
    max: "Jusqu'à 12 joueurs",
    body:
      "Un écran au milieu, la télé ou un PC, qui diffuse la musique et affiche les scores. Chacun scanne le QR code et répond depuis son téléphone. Ceux qui arrivent en retard voient un écran d'attente et entrent tout seuls à la fin de la partie en cours.",
  },
  {
    key: "untel",
    num: "02",
    color: AMBER,
    title: "Un seul téléphone",
    max: "Jusqu'à 5 joueurs",
    body:
      "Pas un tel pour tout le monde ? Chacun pose un doigt sur l'écran. La musique démarre quand toutes les zones sont tenues, et le premier qui lâche prend le téléphone, se cache des autres et tape sa réponse. S'il se plante, on passe au suivant sans révéler le titre. Ici on joue sur la musique importée sur ce téléphone, et s'il n'y a rien d'importé, sur le fonds commun de tout ce que les joueurs de blindz.app ont déjà ramené. Pas de « qui a mis quoi » dans ce mode : un seul tel, une seule bibliothèque.",
  },
  {
    key: "distance",
    num: "03",
    color: BLUE,
    title: "À distance",
    max: "Jusqu'à 12 joueurs",
    body:
      "Tu crées la partie, tu envoies un code à 6 caractères, et tout le monde joue de chez soi. Il y a un chat pour se chambrer, et un pierre-feuille-ciseaux pour patienter en attendant les retardataires.",
  },
] as const

// Les questions posees avant de jouer. Reponses courtes : la version longue est
// sur /faq/, qui reste la seule page a porter le JSON-LD FAQPage.
// Verifie contre le code : cookie invite d'un an (authController), hotes acceptes
// par parseProfileUrl (open.spotify.com et deezer.com seulement, donc les liens
// courts spotify.link / link.deezer.com sont refuses), buzzer a 5 doigts.
const FAQ_TEASER = [
  {
    q: "Il faut créer un compte ?",
    a: "Non. Un pseudo, un lien, et tu joues. L'historique de tes parties tient un an sur le même navigateur, le compte sert seulement à le retrouver sur un autre appareil.",
  },
  {
    q: "C'est vraiment gratuit ?",
    a: "Oui, tout est gratuit. Pas de version payante, pas de pub, rien à installer : ça se joue dans le navigateur.",
  },
  {
    q: "Spotify et Deezer dans la même partie ?",
    a: "Oui, chacun ramène ce qu'il veut et les extraits se mélangent. La seule condition, c'est que le profil ou la playlist soit public.",
  },
  {
    q: "Mon lien ne passe pas, pourquoi ?",
    a: "Presque toujours parce que la playlist est privée, et ça se change en trente secondes. L'autre cause classique, ce sont les liens courts du bouton Partager (spotify.link, link.deezer.com) : ouvre-les et copie l'adresse complète.",
  },
  {
    q: "On n'a pas un téléphone chacun.",
    a: "Le mode un seul tel est fait pour ça, jusqu'à 5 joueurs : tout le monde pose un doigt sur l'écran, et le premier qui lâche prend le téléphone pour répondre.",
  },
  {
    q: "C'est l'ancien Blindz, celui qui avait fermé ?",
    a: "Non. blindz.fr est un autre site, plus ancien, sans lien avec nous. blindz.app est né en 2026 et ne marche pas pareil : il n'y a rien à préparer, la partie sort de vos playlists.",
  },
] as const

// hover:text-* obligatoire : globals.css a un `a:hover { color: terracotta }`
// global qui rendait le texte invisible sur le fond vermillon au survol.
const CTA =
  "inline-block rounded-md border-2 border-[#2e2014] px-7 py-4 font-display text-xl font-bold shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] hover:text-[#f4ecdb] hover:bg-[#b83f29]"

export default function HomePage() {
  return (
    <div className="min-h-screen text-[#2e2014]">
      <script dangerouslySetInnerHTML={{ __html: JOIN_REDIRECT }} />

      <SiteHeader />

      {/* ── Hero : texte a gauche, disque sur son plateau sauge a droite ── */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-[6rem] pt-[4.5rem] sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8 lg:pt-[6rem]">
        <div>
          <Tag color={VERMILION}>Blind test entre potes</Tag>
          <h1 className="mt-5 font-display text-[2.9rem] font-semibold leading-[1.02] sm:text-[4rem] lg:text-[6rem]">
            Le blind test avec <em className="font-medium italic text-[#cc4830]">vos</em> playlists.
          </h1>
          <p className="mt-7 max-w-[34rem] text-[1.1rem] leading-relaxed sm:text-[1.2rem]">
            Chacun colle le lien de son Spotify ou de son Deezer, et la partie se génère toute seule à
            partir de ce que vous écoutez vraiment. Rien à préparer, pas de playlist imposée, et en
            bonus il faut deviner qui a mis quoi.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-6">
            <Link href="/jouer/" className={`${CTA} bg-[#cc4830] text-[#f4ecdb]`}>
              Jouer, c'est gratuit
            </Link>
            <a
              href="#comment-ca-marche"
              className="border-b-2 border-[#2e2014] pb-0.5 text-[13px] font-bold uppercase tracking-[0.14em] transition hover:border-[#cc4830] hover:text-[#cc4830]"
            >
              Comment ça marche
            </a>
          </div>
          <p className="mt-6 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] sm:tracking-[0.16em]">
            <span className="text-[#cc4830]">Sans compte</span>
            <span className="text-[#d88418]">Sans installation</span>
            <span className="text-[#486090]">iPhone, Android, PC</span>
          </p>
        </div>
        <div className="relative">
          <ScrollVinyl />
        </div>
      </section>

      {/* ── Pourquoi c'est pas un blind test comme les autres : bloc encre ── */}
      <section className="border-t-2 border-[#2e2014] bg-[#2e2014] text-[#f4ecdb]">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-[5.5rem] sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <Tag color={AMBER} light>Ce qui change</Tag>
            <h2 className="mt-5 font-display text-[2.2rem] font-semibold leading-[1.08] sm:text-[2.8rem] lg:text-[3.4rem]">
              Les autres te font choisir un pack « années 80 » ou préparer ton quiz à la main.{" "}
              <em className="font-medium italic text-[#d88418]">Ici, non.</em>
            </h2>
          </div>
          <dl className="divide-y-2 divide-[rgba(244,236,219,.22)] lg:pt-10">
            <div className="py-6 first:pt-0">
              <dt className="font-display text-xl font-semibold text-[#d88418]">Vos morceaux, pas les nôtres</dt>
              <dd className="mt-2 text-[1.05rem] leading-relaxed">
                Dans les parties à plusieurs téléphones, la partie est construite uniquement avec les
                musiques des joueurs présents. Si personne n'a ramené de rap, il n'y aura pas de rap. Si
                ton pote n'écoute que de la variété, tout le monde va le savoir.
              </dd>
            </div>
            <div className="py-6">
              <dt className="font-display text-xl font-semibold text-[#d88418]">Zéro préparation</dt>
              <dd className="mt-2 text-[1.05rem] leading-relaxed">
                Pas de morceaux à sélectionner, pas de questions à écrire. Un pseudo, un lien, et
                c'est parti. Le temps de sortir les verres, la partie est prête.
              </dd>
            </div>
            <div className="py-6 last:pb-0">
              <dt className="font-display text-xl font-semibold text-[#d88418]">Le vrai jeu, c'est de deviner qui a mis quoi</dt>
              <dd className="mt-2 text-[1.05rem] leading-relaxed">
                Trouver le titre et l'artiste rapporte des points, et deviner lequel de tes potes écoute
                ça en boucle en rapporte un de plus. C'est là que la table se marre. La vitesse ne sert
                qu'à départager les ex æquo.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Trois facons de jouer : split-screen epingle, une couleur par mode ── */}
      <section className="border-t-2 border-[#2e2014] bg-[#ece1c8]">
        <div className="mx-auto max-w-6xl px-5 py-[5.5rem] sm:px-8">
          <Tag color={VERMILION}>Les modes de jeu</Tag>
          <h2 className="mb-14 mt-5 max-w-[30rem] font-display text-[2.2rem] font-semibold leading-[1.08] sm:text-[2.8rem] lg:text-[3.4rem]">
            Trois façons de jouer, selon où vous êtes et combien de téléphones il y a.
          </h2>
          <ModesStage>
            {MODES.map(m => (
              <article
                key={m.key}
                data-mode={m.key}
                className="border-t-2 border-[#2e2014] py-12 first:border-t-0 first:pt-0 lg:py-[6rem] lg:first:pt-0"
              >
                <p className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.2em]">
                  <span className="rounded-sm px-2 py-1 text-[#f4ecdb]" style={{ background: m.color }}>{m.num}</span>
                  <span>{m.max}</span>
                </p>
                <h3 className="mt-4 font-display text-[1.9rem] font-semibold leading-tight sm:text-[2.4rem]">
                  {m.title}
                </h3>
                <p className="mt-4 max-w-[32rem] text-[1.05rem] leading-relaxed">{m.body}</p>
              </article>
            ))}
          </ModesStage>
          <p className="mt-12 max-w-[40rem] border-t-2 border-[#2e2014] pt-6 text-[1.05rem] leading-relaxed">
            Et tout seul ? Il y a aussi un <strong>mode solo</strong> : tu devines les morceaux de ta propre
            bibliothèque (ou du fonds commun si tu n'as rien importé), pour t'entraîner ou tuer dix minutes
            dans le train. Il est dans le menu des modes une fois que tu as mis ton pseudo.
          </p>
        </div>
      </section>

      {/* ── Comment ca marche : bloc bleu ── */}
      <section id="comment-ca-marche" className="border-t-2 border-[#2e2014] bg-[#486090] text-[#f4ecdb]">
        <div className="mx-auto max-w-6xl px-5 py-[5.5rem] sm:px-8">
          <Tag color={CREAM} light>En trois étapes</Tag>
          <h2 className="mt-5 font-display text-[2.2rem] font-semibold leading-[1.08] sm:text-[2.8rem] lg:text-[3.4rem]">
            Comment ça marche
          </h2>
          <ol className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-12">
            {[
              {
                n: "1",
                t: "Un pseudo",
                b: "Pas de compte, pas de mot de passe. En créer un sert surtout à retrouver ton historique sur un autre appareil.",
              },
              {
                n: "2",
                t: "Un lien",
                b: "Celui de ton profil Spotify ou Deezer, ou d'une playlist publique. Les deux peuvent se mélanger dans la même partie, il faut juste que ce soit public.",
              },
              {
                n: "3",
                t: "On joue",
                b: "À plusieurs téléphones, la partie est générée à partir des playlists de tout le monde : extraits courts, réponse au clavier, un point pour le titre, un pour l'artiste, un pour le bon coupable, et la vitesse départage en cas d'égalité.",
              },
            ].map(step => (
              <li key={step.n} className="border-t-2 border-[rgba(244,236,219,.45)] pt-5">
                <span className="font-display text-5xl font-medium italic">{step.n}</span>
                <h3 className="mt-3 font-display text-2xl font-semibold">{step.t}</h3>
                <p className="mt-2 text-[1.05rem] leading-relaxed">{step.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Les petits trucs qui comptent : bloc ambre ── */}
      <section className="border-t-2 border-[#2e2014] bg-[#d88418] text-[#2e2014]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-[4.5rem] sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <Tag color={INK}>Bon à savoir</Tag>
            <h2 className="mt-5 font-display text-[1.9rem] font-semibold leading-[1.1] sm:text-[2.4rem]">
              Les petits trucs qui comptent
            </h2>
          </div>
          <ul className="space-y-5 lg:pt-3">
            {[
              "La correction est tolérante : les fautes de frappe, les accents, le « feat. » oublié ou le titre et l'artiste inversés, ça passe.",
              "Ça tourne dans le navigateur, sur iPhone, Android ou PC. Tu peux l'ajouter à l'écran d'accueil, ça s'ouvre comme une app.",
              "Ton historique de parties est gardé un an sans compte, tant que tu restes sur le même navigateur. Un compte sert à le retrouver ailleurs.",
              "C'est gratuit. Pas de version pro, pas de pub.",
            ].map(line => (
              <li key={line} className="flex gap-4 text-[1.05rem] leading-relaxed">
                <span aria-hidden className="mt-[0.6rem] h-2.5 w-2.5 shrink-0 rounded-sm bg-[#2e2014]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── FAQ : les questions qu'on pose vraiment avant de lancer ──
          Reponses courtes ici, versions completes sur /faq/ (qui garde le
          JSON-LD FAQPage : une seule source pour les moteurs). */}
      <section className="border-t-2 border-[#2e2014] bg-[#ece1c8]">
        {/* Ordre du DOM : titre, questions, bouton. Sur mobile on lit donc les
            questions AVANT le bouton ; sur desktop la grille explicite remet le
            bouton sous le titre, dans la colonne de gauche. */}
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-[5.5rem] sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:grid-rows-[auto_1fr] lg:gap-x-20 lg:gap-y-0">
          <div className="lg:col-start-1 lg:row-start-1">
            <Tag color={BLUE}>Questions fréquentes</Tag>
            <h2 className="mt-5 font-display text-[2.2rem] font-semibold leading-[1.08] sm:text-[2.8rem] lg:text-[3.4rem]">
              Ce qu'on nous demande avant de lancer une partie
            </h2>
          </div>
          <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <FaqAccordion items={FAQ_TEASER} />
          </div>
          <Link
            href="/faq/"
            className="justify-self-start rounded-md border-2 border-[#2e2014] px-6 py-3 font-display text-lg font-bold shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#2e2014] hover:text-[#f4ecdb] hover:shadow-[2px_2px_0_#2e2014] lg:col-start-1 lg:row-start-2 lg:mt-8 lg:self-start"
          >
            Toutes les questions
          </Link>
        </div>
      </section>

      {/* ── Fin de face : on lance ? ── */}
      <section className="border-t-2 border-[#2e2014]">
        <div className="mx-auto max-w-6xl px-5 py-[6rem] sm:px-8">
          <Tag color={VERMILION}>Prêt ?</Tag>
          <h2 className="mt-5 font-display text-[3rem] font-semibold leading-[1] sm:text-[4.2rem] lg:text-[5.4rem]">
            On lance ?
          </h2>
          <div className="mt-9 flex flex-wrap items-center gap-6">
            <Link href="/jouer/" className={`${CTA} bg-[#cc4830] text-[#f4ecdb]`}>
              Jouer maintenant
            </Link>
            <Link
              href="/faq/"
              className="border-b-2 border-[#2e2014] pb-0.5 text-[13px] font-bold uppercase tracking-[0.14em] transition hover:border-[#cc4830] hover:text-[#cc4830]"
            >
              Une question ? La FAQ
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
