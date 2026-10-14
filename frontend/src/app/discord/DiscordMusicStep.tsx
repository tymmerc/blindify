"use client"

import { useCallback, useState } from "react"
import { Loader2 } from "lucide-react"
import { MusicLibrary } from "@/components/import/MusicLibrary"
import { ProfileImportBlock } from "@/components/import/ProfileImportBlock"
import type { ImportedLink } from "@/lib/types"
import { CARD, Label } from "@/app/multiplayer/lobbyKit"

/**
 * « Ta musique », dans l'Activite Discord : juste apres la connexion, avant la
 * salle (demande de Tym du 14/10/2026). On colle le lien d'une playlist ou on
 * coche ce qu'on a deja importe ; on peut entrer sans. Les reglages de partie
 * restent dans le lobby. Le meme ecran s'ouvre depuis le lobby (mode "edit"),
 * par-dessus, sans quitter la salle.
 * Mobile d'abord : une colonne, le bouton colle en bas.
 */
const ACCENT = "#c65133"

type Props = {
  mode: "launch" | "edit"
  onContinue: () => void
  entering?: boolean
  error?: string | null
}

export function DiscordMusicStep({ mode, onContinue, entering = false, error = null }: Props) {
  const [libRefresh, setLibRefresh] = useState(0)
  const [activeLinks, setActiveLinks] = useState(0)
  const onLinksChange = useCallback((links: ImportedLink[]) => setActiveLinks(links.filter(l => l.active).length), [])

  const label = mode === "edit"
    ? "Retour au lobby"
    : entering
      ? "On entre…"
      : activeLinks > 0
        ? "Entrer dans la salle"
        : "Entrer sans musique"

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-32 pt-6 text-[#2e2014] sm:px-6" data-testid="discord-musique">
      <Label dot={ACCENT} className="mb-3">Avant d&apos;entrer</Label>
      <h1 className="m-0 font-display text-[2.1rem] font-semibold leading-[1.04] sm:text-5xl">
        Ta musique <em className="text-[#c65133]">pour ce soir</em>
      </h1>
      <p className="mb-5 mt-3 text-[15px] leading-snug">
        La partie pioche dans la musique de chaque joueur du salon. Colle le lien d&apos;une playlist Spotify ou Deezer, ou coche
        ce que tu as déjà amené.
      </p>

      <section className={`${CARD} p-4 sm:p-5`}>
        <Label dot={ACCENT} className="mb-3">Une playlist</Label>
        <ProfileImportBlock accent={ACCENT} hideHeader onImported={() => setLibRefresh(n => n + 1)} />
      </section>

      <section className={`${CARD} mt-4 p-4 sm:p-5`}>
        <Label dot="#789084" className="mb-3">Déjà dans ta bibliothèque</Label>
        <MusicLibrary
          accent={ACCENT}
          refreshSignal={libRefresh}
          onLinksChange={onLinksChange}
          emptyText="Rien pour l'instant : ce que tu importes au-dessus arrive ici, et reste pour tes prochaines parties."
        />
      </section>

      {/* Le bouton reste a portee du pouce, au-dessus du papier qui defile. */}
      <div className="fixed inset-x-0 bottom-0 border-t-2 border-[#2e2014] bg-[#f4ecdb] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto w-full max-w-xl">
          {error ? <p className="m-0 mb-2 text-sm font-semibold text-[#9c2f1d]" role="alert">{error}</p> : null}
          <button
            type="button"
            onClick={onContinue}
            disabled={entering}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-[#2e2014] bg-[#c65133] px-5 py-3.5 text-[15px] font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] disabled:opacity-70"
          >
            {entering ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {label}
          </button>
          {mode === "launch" && activeLinks === 0 && !entering ? (
            <p className="m-0 mt-2 text-center text-[13px]">Sans musique, tu joues avec celle des autres. Tu pourras en ajouter depuis le lobby.</p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
