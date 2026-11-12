/**
 * T26 : navigateur integre d'une appli (Snapchat, Instagram...). Il garde ses
 * propres cookies, a part de Safari ou Chrome : un joueur qui ouvre le lien de
 * la salle depuis Snapchat y devient un invite neuf, sans ses parties ni sa
 * musique. Vu le 05/11/2026 sur 3 des 4 iPhones de la soiree.
 *
 * On ne reconnait que les applis qui se signalent dans leur User-Agent. La vue
 * Safari ouverte depuis une appli, et la navigation privee, ne se voient pas :
 * pour celles-la, seul un compte (pseudo + mot de passe) relie les parties.
 */
const APPS: ReadonlyArray<[RegExp, string]> = [
  [/Snapchat/i, "Snapchat"],
  [/Instagram/i, "Instagram"],
  [/FBAN\/Messenger|MessengerForiOS|FB_IAB\/MESSENGER/i, "Messenger"],
  [/FBAN|FBAV|FB_IAB/i, "Facebook"],
  [/musical_ly|BytedanceWebview|TikTok/i, "TikTok"],
  [/LinkedInApp/i, "LinkedIn"],
  [/\bLine\//, "LINE"],
]

export function inAppBrowserName(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  for (const [pattern, name] of APPS) {
    if (pattern.test(userAgent)) return name
  }
  return null
}

/** Le navigateur a conseiller selon le telephone. */
export function regularBrowserName(userAgent: string | null | undefined): string {
  return /iPhone|iPad|iPod/i.test(userAgent ?? "") ? "Safari" : "ton navigateur"
}
