import { ExternalLink } from "lucide-react"
import { DISCORD_FRIENDS_NOTE, DISCORD_INSTALL_URL, DISCORD_STEPS } from "@/lib/discord/install"

// « Jouer sur Discord » : renvoie vers l'installation de l'Activite, dans un
// nouvel onglet. Deux formes :
//  - DiscordPlay : le bouton et les 3 etapes (accueil, guide a distance) ;
//  - DiscordHint : une ligne discrete, les etapes repliees (wizard, lobby).
// Aucun etat React : <details> replie les etapes, le composant reste rendu
// cote serveur sur les pages statiques. Jamais affiche dans l'Activite.
//
// DA Club analogique : encre et papier, ombre dure, pas de violet Discord.
// hover:text-* obligatoire : globals.css colore tous les liens en terracotta
// au survol.

type Tone = "light" | "dark"

const SR_NEW_TAB = <span className="sr-only"> (s&apos;ouvre dans un nouvel onglet)</span>

function StepList({ tone, compact }: { tone: Tone; compact?: boolean }) {
  const num = tone === "dark" ? "text-[#e0a32e]" : "text-[#c65133]"
  return (
    // compact : la ligne est souvent centree, la liste reste un bloc aligne a gauche au milieu.
    <ol className={`m-0 list-none p-0 ${compact ? "mx-auto w-fit max-w-full space-y-1 text-left text-[13px]" : "space-y-2 text-[0.98rem]"}`}>
      {DISCORD_STEPS.map((s, i) => (
        <li key={s} className="flex gap-2">
          <span aria-hidden className={`w-5 shrink-0 font-display font-semibold italic ${num}`}>{i + 1}.</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  )
}

/** heading=false : la section qui l'accueille pose deja la question (guide). */
export function DiscordPlay({ tone = "light", heading = true, className = "" }: { tone?: Tone; heading?: boolean; className?: string }) {
  const dark = tone === "dark"
  const box = dark
    ? "border-[rgba(244,236,219,.45)] text-[#f4ecdb]"
    : "border-[#2e2014] bg-[#f4ecdb] text-[#2e2014] shadow-[4px_4px_0_rgba(46,32,20,.18)]"
  const button = dark
    ? "border-[#f4ecdb] bg-[#f4ecdb] text-[#2e2014] shadow-[3px_3px_0_rgba(0,0,0,.35)] hover:bg-[#ece1c8] hover:text-[#2e2014]"
    : "border-[#2e2014] bg-[#2e2014] text-[#f4ecdb] shadow-[3px_3px_0_rgba(46,32,20,.3)] hover:bg-[#46331f] hover:text-[#f4ecdb]"
  const muted = dark ? "text-[#e9dcc0]" : "text-[#6b573f]"
  return (
    <div className={`rounded-md border-2 p-5 sm:p-6 ${box} ${className}`} data-testid="discord-play">
      {heading ? (
        <>
          <p className={`m-0 font-mono text-[11px] font-bold uppercase tracking-[0.2em] ${muted}`}>En appel sur Discord ?</p>
          <p className="m-0 mt-2 font-display text-[1.35rem] font-semibold leading-snug">
            Jouez directement <em className="font-medium italic">dans l&apos;appel</em>, sans code à partager.
          </p>
        </>
      ) : null}
      <div className={`${heading ? "mt-4" : ""} grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-7`}>
        <a
          href={DISCORD_INSTALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center justify-center gap-2 self-start justify-self-start rounded-md border-2 px-5 py-3 font-display text-lg font-bold no-underline transition hover:translate-x-[1px] hover:translate-y-[1px] ${button}`}
        >
          Jouer sur Discord
          <ExternalLink aria-hidden className="h-4 w-4" />
          {SR_NEW_TAB}
        </a>
        <div>
          <StepList tone={tone} />
          <p className={`m-0 mt-3 text-[0.92rem] leading-relaxed ${muted}`}>{DISCORD_FRIENDS_NOTE}</p>
        </div>
      </div>
    </div>
  )
}

export function DiscordHint({ tone = "light", className = "" }: { tone?: Tone; className?: string }) {
  const dark = tone === "dark"
  const text = dark ? "text-[#e9dcc0]" : "text-[#6b573f]"
  const link = dark
    ? "text-[#f4ecdb] decoration-[#f4ecdb] hover:text-[#e0a32e]"
    : "text-[#2e2014] decoration-[#2e2014] hover:text-[#c65133]"
  return (
    <div className={`text-[13px] leading-relaxed ${text} ${className}`} data-testid="discord-hint">
      <p className="m-0">
        Vous êtes en appel Discord ?{" "}
        <a
          href={DISCORD_INSTALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 font-bold underline decoration-[1.5px] underline-offset-2 ${link}`}
        >
          Jouez directement dans l&apos;appel
          <ExternalLink aria-hidden className="h-3 w-3" />
          {SR_NEW_TAB}
        </a>
      </p>
      <details className="mt-1">
        <summary className={`cursor-pointer select-none text-[12px] font-semibold underline decoration-dotted underline-offset-2 ${text}`}>
          Comment ça marche ?
        </summary>
        <div className="mt-2">
          <StepList tone={tone} compact />
          <p className="m-0 mt-1.5 text-[12px]">{DISCORD_FRIENDS_NOTE}</p>
        </div>
      </details>
    </div>
  )
}
