// L'adresse de la page d'une salle (T7). Le 01/11, Manou est entree par
// l'adresse de la page de Maelia, copiee dans la barre du navigateur :
// /multiplayer/?mode=event&intent=host&nickname=Mae&code=VRLVDU. Le pseudo de
// l'adresse a servi a creer sa session invitee (et le serveur renomme un
// invite qui rejoint avec un pseudo) : un deuxieme « Mae » est apparu.

export const NICKNAME_KEY = "blindify_nickname"

/**
 * Le pseudo a utiliser en arrivant sur une salle.
 * - Sans code (on cree la salle) : celui de l'adresse, pose par /jouer/ ou /modes.
 * - Avec un code (salle qui existe) : JAMAIS celui de l'adresse, qui peut etre
 *   celui de quelqu'un d'autre. Celui de ce navigateur, ou on le demande.
 */
export function entryNickname({ urlNick, storedNick, code }: { urlNick: string | null; storedNick: string | null; code: string | null }): {
  nickname: string | null
  needsName: boolean
} {
  const stored = (storedNick ?? "").trim() || null
  if (code) return { nickname: stored, needsName: !stored }
  return { nickname: (urlNick ?? "").trim() || stored, needsName: false }
}

/** L'entree par le QR : pseudo, musique, puis la salle. */
export function joinEntryPath(code: string): string {
  return `/jouer/?join=${encodeURIComponent(code.toUpperCase().replace(/[^A-Z0-9]/g, ""))}`
}

/**
 * L'adresse a garder dans la barre une fois dans la salle : le code, sans le
 * role ni le pseudo. Recopiee par un ami, elle le fait entrer comme invite.
 */
export function lobbyAddress(href: string, code: string): string {
  const url = new URL(href)
  url.searchParams.set("code", code)
  url.searchParams.delete("intent")
  url.searchParams.delete("nickname")
  return url.toString()
}

export function readStoredNickname(): string | null {
  try {
    return window.localStorage.getItem(NICKNAME_KEY)
  } catch {
    return null
  }
}

export function rememberNickname(nickname: string): void {
  try {
    window.localStorage.setItem(NICKNAME_KEY, nickname)
  } catch { /* stockage bloque : on s'en passe */ }
}
