import { DISCORD_SUPPORT_URL } from "@/lib/contact"
import { followExternalLink } from "@/lib/externalLink"

// Une ligne discrete vers le serveur Discord de Blindz, a chaque fin de partie
// (demande de Tym du 08/11 : pouvoir parler aux bandes qui reviennent).
// Dans l'Activite Discord, le lien passe par le SDK (followExternalLink) :
// jamais de navigation dans l'iframe, Discord ouvre l'invitation lui-meme.

export const DISCORD_SERVER_TEXT = "Rejoins le serveur Discord de Blindz"
export const DISCORD_SERVER_INTRO = "Une idée, un souci, envie de jouer avec d'autres ?"

export function DiscordServerLine({ className = "" }: { className?: string }) {
  return (
    <p data-testid="fin-discord" className={`text-xs text-ink-2 ${className}`}>
      {DISCORD_SERVER_INTRO}{" "}
      <a
        href={DISCORD_SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={event => followExternalLink(event, DISCORD_SUPPORT_URL)}
        className="font-semibold text-ink underline decoration-dotted underline-offset-4 hover:text-terra-txt"
      >
        {DISCORD_SERVER_TEXT}
        <span className="sr-only"> (s&apos;ouvre dans un nouvel onglet)</span>
      </a>
    </p>
  )
}
