import Image from "next/image"
import { publicPath } from "@/lib/publicPath"

/**
 * Credits des sources musicales, exiges par leurs conditions
 * (docs/CONDITIONS-API-MUSIQUE.md, T10 du 10/10/2026).
 *
 * - Deezer fournit tous les extraits : logo officiel (lockup horizontal noir et
 *   violet, deezerbrand.com) la ou ils jouent, et la mention d'usage prive
 *   (« inform by any means any person accessing the Content »).
 * - Spotify : logo complet et lien retour sur les morceaux importes de Spotify.
 *   Logo noir monochrome : le vert est reserve aux fonds noir ou blanc, pas au
 *   papier creme. Au moins 70 px de large, marge de la moitie de l'icone.
 *
 * Le lien Spotify donne la reponse : on ne le rend que dans les cartes de
 * reveal. Pendant la manche, la piste est caviardee (trackId "hidden", pas de
 * provider), et spotifyTrackUrl ne renvoie rien de toute facon.
 */

const SPOTIFY_TRACK_ID_RE = /^[A-Za-z0-9]{22}$/

export function spotifyTrackUrl(provider: string | null | undefined, trackId: string | null | undefined): string | null {
  if (provider !== "spotify" || !trackId || !SPOTIFY_TRACK_ID_RE.test(trackId)) return null
  return `https://open.spotify.com/track/${trackId}`
}

type DeezerCreditProps = {
  /** La phrase d'usage prive a cote du logo (par defaut). */
  notice?: boolean
  className?: string
}

export function DeezerCredit({ notice = true, className = "" }: DeezerCreditProps) {
  return (
    <p className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] leading-tight text-[#6b573f] ${className}`}>
      <span className="font-bold uppercase tracking-[0.18em] text-[#8a7558]">Extraits</span>
      <Image src={publicPath("/marques/deezer-logo.png")} alt="Deezer" width={71} height={20} className="h-5 w-auto" unoptimized />
      {notice ? <span>pour une écoute privée, entre amis ou en famille</span> : null}
    </p>
  )
}

type SpotifyTrackLinkProps = {
  provider: string | null | undefined
  trackId: string | null | undefined
  className?: string
}

export function SpotifyTrackLink({ provider, trackId, className = "" }: SpotifyTrackLinkProps) {
  const href = spotifyTrackUrl(provider, trackId)
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-3 rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#f4ecdb] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#2e2014] transition hover:border-[#2e2014] ${className}`}
    >
      <Image src={publicPath("/marques/spotify-logo-noir.svg")} alt="" width={80} height={22} className="h-[22px] w-auto" unoptimized />
      <span>Écouter sur Spotify</span>
    </a>
  )
}
