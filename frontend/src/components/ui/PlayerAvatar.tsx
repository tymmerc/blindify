"use client"

import { useEffect, useState, type CSSProperties } from "react"

export interface PlayerAvatarProps {
  name: string | null | undefined
  /** Photo du joueur (champ `avatar` de l'etat de jeu ou de la salle). */
  avatarUrl?: string | null
  /** Taille, bordure, couleur de fond : au choix de l'appelant. */
  className?: string
  style?: CSSProperties
}

function initialOf(name: string | null | undefined): string {
  const first = name?.trim() ? Array.from(name.trim())[0] : undefined
  return first ? first.toUpperCase() : "?"
}

/**
 * Pastille ronde d'un joueur : sa photo recadree s'il en a une, sinon son
 * initiale. Retombe sur l'initiale si l'image ne charge pas. Decorative
 * (aria-hidden) : le pseudo est toujours ecrit a cote.
 */
export function PlayerAvatar({ name, avatarUrl, className, style }: PlayerAvatarProps) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [avatarUrl])
  const showImage = Boolean(avatarUrl) && !broken
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold leading-none ${className ?? ""}`}
      style={style}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl ?? ""} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initialOf(name)
      )}
    </span>
  )
}
