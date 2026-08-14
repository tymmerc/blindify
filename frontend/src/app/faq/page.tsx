import type { Metadata } from "next"
import Link from "next/link"

// Page FAQ : redigee pour repondre aux questions telles qu'on les pose vraiment
// (a un moteur de recherche ou a une IA). Chaque question colle a une requete
// conversationnelle reelle ; le JSON-LD FAQPage permet aux moteurs de la citer.

export const metadata: Metadata = {
  title: "FAQ · Blind test avec vos playlists, entre amis",
  description:
    "Comment faire un blind test avec ses propres playlists Spotify ou Deezer, sans compte, sur téléphone, entre amis ou avec un seul tel. Toutes les réponses.",
}

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Comment faire un blind test avec mes propres playlists, pas des playlists imposées ?",
    a: "C'est exactement le principe de Blindz : chaque joueur colle le lien de son profil Spotify ou Deezer (ou d'une playlist publique), et la partie est générée uniquement à partir de VOS musiques. Pas de playlists toutes faites \"années 80\" ou \"hits du moment\" : vous jouez sur les morceaux que vous écoutez vraiment, et une partie du jeu consiste à deviner qui a ramené quel titre.",
  },
  {
    q: "Comment organiser un blind test en soirée, autour d'une table ?",
    a: "Le mode \"Autour d'une table\" est fait pour ça : un écran central (le téléphone de l'organisateur, ou un PC branché sur la télé) diffuse la musique et affiche les scores, et chacun répond depuis son propre téléphone en scannant un QR code. L'organisateur peut jouer aussi ou seulement présenter. Les retardataires rejoignent automatiquement entre deux parties.",
  },
  {
    q: "Peut-on faire un blind test avec un seul téléphone ?",
    a: "Oui, c'est le mode \"Un seul tel\" : tout le monde pose un doigt sur l'écran du même téléphone, la musique démarre quand toutes les zones sont tenues, et le premier qui lâche prend le tel, se cache et tape sa réponse. S'il se trompe, le téléphone passe au deuxième qui a lâché, sans révéler la réponse. Jusqu'à 5 joueurs, zéro configuration.",
  },
  {
    q: "Faut-il créer un compte pour jouer ?",
    a: "Non. Tu choisis un pseudo, tu colles un lien de playlist, et tu joues. Ton historique de parties est conservé sur ton appareil pendant un an sans inscription. Créer un compte (pseudo + mot de passe) sert uniquement à retrouver ton historique sur un autre appareil.",
  },
  {
    q: "Est-ce que ça marche avec Spotify ET Deezer en même temps ?",
    a: "Oui. Dans une même partie, un joueur peut importer sa musique depuis Spotify et un autre depuis Deezer : les extraits sont mélangés et tout le monde joue ensemble. Il suffit que les playlists ou le profil soient publics.",
  },
  {
    q: "Comment jouer à distance avec des amis ?",
    a: "Le mode \"À distance\" : tu crées une partie, tu partages le code à 6 caractères, et chacun joue depuis chez lui sur son écran, avec le chat intégré et un pierre-feuille-ciseaux pour patienter dans le salon. Jusqu'à 12 joueurs.",
  },
  {
    q: "C'est gratuit ? Il faut installer une application ?",
    a: "Blindz est gratuit et fonctionne dans le navigateur, sur iPhone, Android et PC, rien à installer. Tu peux l'ajouter à ton écran d'accueil pour l'ouvrir comme une app.",
  },
  {
    q: "Comment le jeu reconnaît-il mes réponses ?",
    a: "Tu tapes le titre (et l'artiste en bonus) : la correction est tolérante aux fautes de frappe, aux accents, aux \"feat.\" et aux inversions titre/artiste. Trouver le titre ET l'artiste rapporte plus de points, et répondre vite aussi.",
  },
]

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(item => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  }

  return (
    <div className="min-h-screen text-[#2e2014] pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-2xl px-5 pt-10">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            Retour à l'accueil
          </Link>
        </div>

        <div className="mb-10 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">FAQ</p>
          <h1 className="font-display text-4xl font-semibold md:text-5xl">
            Le blind test avec <em className="font-medium italic text-[#c65133]">vos</em> musiques
          </h1>
          <p className="text-base text-[#6b573f]">
            Pas de playlists imposées, pas de compte obligatoire : un blind test généré à partir de ce que
            vous écoutez vraiment, en soirée ou à distance.
          </p>
        </div>

        <div className="space-y-4">
          {FAQ.map(item => (
            <section
              key={item.q}
              className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-5 shadow-[4px_4px_0_rgba(46,32,20,.18)]"
            >
              <h2 className="m-0 font-display text-xl font-semibold leading-snug">{item.q}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-[#4a3a26]">{item.a}</p>
            </section>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/"
            className="inline-block rounded-md border-2 border-[#2e2014] bg-[#c65133] px-6 py-4 font-display text-lg font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
          >
            Lancer un blind test
          </Link>
        </div>
      </div>
    </div>
  )
}
