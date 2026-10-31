"use client"

/**
 * Page du mode streamer (T5) : ce que c'est, les trois formats, et le guide
 * OBS en une minute (#obs), vers lequel pointe le lobby. Page publique : un
 * streamer peut la lire avant de creer sa salle.
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { liveLabel } from "@/lib/streamerLive"
import { STREAMER_FORMATS } from "@/app/multiplayer/StreamerLobbyView"

const ACCENT = "#7d9471"
const CARD = "rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 shadow-[4px_4px_0_rgba(46,32,20,.18)]"

const OBS_STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Ajoute l'overlay",
    body: "Dans OBS : Sources, +, Navigateur. Colle le lien copié dans le lobby, largeur 1920, hauteur 1080. Le fond est transparent, place-le par-dessus ta scène.",
  },
  {
    title: "Donne-lui sa propre piste audio",
    body: "Dans les propriétés de la source, coche « Contrôler l'audio via OBS ». Ensuite, dans Propriétés audio avancées, coche pour cette source seulement la piste 1 (le live), et laisse ton micro et ton jeu sur les pistes 1 et 2.",
  },
  {
    title: "Exclus cette piste de la VOD",
    body: "Dans Paramètres, Sortie, choisis la piste 2 comme piste VOD Twitch. Ta VOD et tes clips partent alors sans la musique. Fais une VOD de test pour vérifier.",
  },
  {
    title: "Entends la musique toi aussi",
    body: "Dans Propriétés audio avancées, mets la surveillance de l'overlay sur « Monitoring et sortie ». Sinon, le bouton « Écouter ici » de ta page de partie fait l'affaire.",
  },
]

export default function StreamerEntryPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen px-6 py-10 text-[#2e2014]">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.32em]" style={{ color: ACCENT }}>Avec ta communauté</p>
            <h1 className="font-display text-4xl font-semibold leading-tight md:text-5xl">
              Un blind test en live avec ton <em className="font-medium italic" style={{ color: ACCENT }}>chat</em>
            </h1>
            <p className="max-w-2xl text-base text-[#6b573f]">
              Tu joues ta musique, l&apos;overlay l&apos;envoie dans le stream, et ton public répond depuis son téléphone sur {liveLabel()},
              ou directement dans ton chat Twitch avec <b>!b titre - artiste</b>. Classement en direct, podium à la fin.
            </p>
          </div>
          <Link href="/modes" className="rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]">
            Retour aux modes
          </Link>
        </header>

        <div className={`${CARD} flex flex-col gap-4`}>
          <h2 className="m-0 font-display text-2xl font-semibold">Ouvrir ta salle de live</h2>
          <p className="m-0 text-sm text-[#6b573f]">Il te faut une playlist importée. Le lobby te donne le lien de l&apos;overlay et le code à montrer au chat.</p>
          <button
            type="button"
            onClick={() => router.push("/multiplayer?mode=streamer&intent=host")}
            className="w-full rounded-md border-2 border-[#2e2014] px-6 py-3 font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] sm:w-auto"
            style={{ background: "#c65133" }}
          >
            Créer ma salle streamer
          </button>
        </div>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Les formats">
          {STREAMER_FORMATS.map(f => (
            <div key={f.value} className={CARD}>
              <h3 className="m-0 font-display text-lg font-semibold">{f.title}</h3>
              <p className="m-0 mt-2 text-sm text-[#6b573f]">{f.desc}</p>
            </div>
          ))}
        </section>

        <section id="obs" className={`${CARD} scroll-mt-6`}>
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]">Guide OBS · une minute</p>
          <h2 className="m-0 mt-1 font-display text-2xl font-semibold">Le son dans le live, pas dans ta VOD</h2>
          <ol className="m-0 mt-5 flex list-none flex-col gap-4 p-0">
            {OBS_STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2e2014] font-display text-sm font-bold" style={{ background: ACCENT }}>{i + 1}</span>
                <div>
                  <p className="m-0 font-semibold">{step.title}</p>
                  <p className="m-0 mt-1 text-sm text-[#6b573f]">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={CARD} aria-label="La musique et les droits">
          <h2 className="m-0 font-display text-xl font-semibold">La musique et les droits</h2>
          <p className="m-0 mt-2 text-sm text-[#6b573f]">
            Les extraits viennent de Deezer : ce n&apos;est pas de la musique libre de droits, et Blindz ne te donne aucune licence.
            Tu restes responsable de ce que tu diffuses sur ta plateforme. Sur Twitch, le risque le plus courant est une VOD coupée
            ou des clips supprimés, et une plainte d&apos;un ayant droit peut aller plus loin. Garder la musique hors de ta VOD le
            réduit, sans le faire disparaître.
          </p>
        </section>
      </div>
    </div>
  )
}
