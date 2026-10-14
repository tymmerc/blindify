/**
 * Liens vers l'exterieur (« Ecouter sur Spotify », aide a l'import). Sur le
 * site, le navigateur les suit. Dans l'iframe d'une Activite Discord, un lien
 * target=_blank est bloque : l'Activite pose ici un ouvreur qui passe par le
 * SDK (commands.openExternalLink), Discord demande alors confirmation au joueur.
 */
type Opener = (url: string) => void

let opener: Opener | null = null

export function setExternalLinkOpener(next: Opener | null): void {
  opener = next
}

export function followExternalLink(event: { preventDefault(): void }, url: string): void {
  if (!opener) return
  event.preventDefault()
  opener(url)
}
