"use client"

/**
 * « 👀 1 spectateur » (T18) : petite etiquette discrete, cote joueurs, quand
 * l'editeur de Blindz regarde la partie. Rien quand personne ne regarde.
 * Style Club analogique : pastille papier, filet encre, texte secondaire.
 */
export function SpectatorBadge({ count, className = "" }: { count: number; className?: string }) {
  if (!Number.isInteger(count) || count <= 0) return null
  const label = count > 1 ? `${count} spectateurs` : "1 spectateur"
  return (
    <span
      role="status"
      aria-label={`${label} regarde${count > 1 ? "nt" : ""} la partie`}
      title="L'éditeur de Blindz regarde la partie en direct, sans pouvoir jouer. Rien n'est enregistré."
      data-testid="spectator-badge"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] border-[#2e2014]/40 bg-[#efe5d0] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6b573f] ${className}`}
    >
      <span aria-hidden className="text-[12px] leading-none">👀</span>
      <span>{label}</span>
    </span>
  )
}
