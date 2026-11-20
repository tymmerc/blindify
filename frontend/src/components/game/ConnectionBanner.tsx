"use client"

import type { ConnectionStatus } from "@/hooks/useConnectionStatus"

const TEXT: Record<Exclude<ConnectionStatus, "ok">, string> = {
  reconnecting: "Connexion perdue, on se reconnecte…",
  lost: "Le serveur ne répond pas, on réessaie…",
  back: "Reconnecté",
}

const DOT: Record<Exclude<ConnectionStatus, "ok">, string> = {
  reconnecting: "bg-ambre motion-safe:animate-pulse",
  lost: "bg-rouge motion-safe:animate-pulse",
  back: "bg-sage",
}

/**
 * Pastille en haut de l'ecran pendant une coupure du socket (redemarrage du
 * serveur, reseau). Pas de bouton « Recharger » : dans l'activite Discord, un
 * rechargement de l'iframe casse tout. La zone role="status" reste en place
 * meme vide, pour que les lecteurs d'ecran annoncent bien le changement.
 */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-[max(env(safe-area-inset-top),0.75rem)]"
    >
      {status === "ok" ? null : (
        <span
          data-testid="bandeau-reconnexion"
          data-etat={status}
          className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line bg-paper px-3.5 py-1.5 text-xs font-bold text-ink"
        >
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} />
          {TEXT[status]}
        </span>
      )}
    </div>
  )
}
