/**
 * Textes de l'import YouTube montres au joueur. Le serveur cherche chaque
 * video de la playlist chez Deezer (le son vient de Deezer, jamais de
 * YouTube) et rend ce compte rendu ; on le dit tel quel, sans arrondir.
 */
import type { YoutubeRefusal } from "@/lib/musicLink"

export type YoutubeImportReport = {
  /** Videos lisibles dans la playlist (au plus 200). */
  playlistSize: number
  /** Videos regardees : les premieres de la playlist. */
  examined: number
  /** Videos dont le morceau a ete retrouve chez Deezer. */
  found: number
  notFound: number
  /** Pas verifiees : Deezer n'a pas repondu, ou plus le temps. */
  unchecked: number
}

/** « 42 morceaux sur 50 retrouvés ». */
export function youtubeSummary(r: YoutubeImportReport): string {
  const s = r.found > 1 ? "s" : ""
  return `${r.found} morceau${r.found > 1 ? "x" : ""} sur ${r.examined} retrouvé${s}`
}

/** Ce qui manque, et pourquoi. null si tout a ete retrouve. */
export function youtubeDetail(r: YoutubeImportReport): string | null {
  const parts: string[] = []
  if (r.notFound > 0) parts.push("Les autres ne sont pas chez Deezer avec un extrait, on les a laissés de côté.")
  if (r.unchecked > 0) parts.push("On n'a pas eu le temps de tout vérifier : réimporte le lien plus tard pour la suite.")
  if (r.playlistSize > r.examined) parts.push(`On a pris les ${r.examined} premiers de la playlist.`)
  return parts.length ? parts.join(" ") : null
}

/** Pourquoi un lien YouTube ne peut pas etre importe, dit avant l'envoi. */
export const YOUTUBE_REFUSAL: Record<YoutubeRefusal, string> = {
  video: "C'est le lien d'une vidéo. Colle celui de la playlist : il contient « list= ».",
  mix: "Les mix YouTube ne se partagent pas. Colle le lien d'une playlist.",
  private: "Tes « J'aime » et « À regarder plus tard » sont privés sur YouTube. Mets ces titres dans une playlist publique ou non répertoriée.",
}
