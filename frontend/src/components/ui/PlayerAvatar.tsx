"use client"

import { useState, type CSSProperties } from "react"
import { avatarInitial, avatarSrc } from "@/lib/photo"

export interface PlayerAvatarProps {
  name: string | null | undefined
  /** users.avatar tel que le serveur l'envoie (photo Blindz ou avatar Discord). */
  avatarUrl?: string | null
  /** Taille, bordure, fond et police : chaque ecran garde son allure. */
  className?: string
  style?: CSSProperties
}

/**
 * Le rond d'un joueur (T39) : sa photo s'il en a une, sinon l'initiale de son
 * pseudo. Si la photo ne charge pas, on retombe sur l'initiale. Decoratif : le
 * pseudo est toujours ecrit a cote, d'ou aria-hidden et alt vide.
 */
export function PlayerAvatar({ name, avatarUrl, className = "", style }: PlayerAvatarProps) {
  const src = avatarSrc(avatarUrl)
  const [failed, setFailed] = useState<string | null>(null)
  const showPhoto = src !== null && failed !== src

  return (
    <span
      aria-hidden
      data-testid="player-avatar"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={style}
    >
      {showPhoto ? (
        // Export statique : pas d'optimiseur d'images, une photo de 256 px suffit.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(src)}
        />
      ) : (
        avatarInitial(name)
      )}
    </span>
  )
}
