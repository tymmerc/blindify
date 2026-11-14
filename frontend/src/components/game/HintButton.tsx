"use client"

import { useState, useCallback, useEffect } from "react"

export interface HintButtonProps {
  track: { title: string; artist: string }
  disabled: boolean
  onHintUsed: () => void
}

export function HintButton({ track, disabled, onHintUsed }: HintButtonProps) {
  const [titleRevealed, setTitleRevealed] = useState(false)
  const [artistRevealed, setArtistRevealed] = useState(false)

  // L'indice est propre a la manche : on le remet a zero des que le titre change,
  // sinon "Commence par : X" fuit sur les manches suivantes.
  useEffect(() => {
    setTitleRevealed(false)
    setArtistRevealed(false)
  }, [track.title, track.artist])

  const handleTitleHint = useCallback(() => {
    if (titleRevealed || disabled) return
    setTitleRevealed(true)
    onHintUsed()
  }, [titleRevealed, disabled, onHintUsed])

  const handleArtistHint = useCallback(() => {
    if (artistRevealed || disabled) return
    setArtistRevealed(true)
    onHintUsed()
  }, [artistRevealed, disabled, onHintUsed])

  const titleFirstLetter = track.title.trim().charAt(0).toUpperCase()
  const artistFirstLetter = track.artist.trim().charAt(0).toUpperCase()

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleTitleHint}
          disabled={disabled || titleRevealed}
          className="rounded-full border-[1.5px] border-line bg-transparent px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink transition hover:bg-gold hover:text-on-accent disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {titleRevealed ? `Commence par : ${titleFirstLetter}...` : "Indice · Titre"}
        </button>
        <button
          type="button"
          onClick={handleArtistHint}
          disabled={disabled || artistRevealed}
          className="rounded-full border-[1.5px] border-line bg-transparent px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink transition hover:bg-gold hover:text-on-accent disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {artistRevealed ? `Artiste commence par : ${artistFirstLetter}...` : "Indice · Artiste"}
        </button>
      </div>
      {(titleRevealed || artistRevealed) && (
        <div className="flex gap-2">
          {titleRevealed && (
            <span className="rounded-full border-[1.5px] border-gold bg-gold/15 px-3 py-1 text-[11px] font-bold text-gold-deep-txt">
              Commence par : {titleFirstLetter}...
            </span>
          )}
          {artistRevealed && (
            <span className="rounded-full border-[1.5px] border-gold bg-gold/15 px-3 py-1 text-[11px] font-bold text-gold-deep-txt">
              Artiste commence par : {artistFirstLetter}...
            </span>
          )}
        </div>
      )}
    </div>
  )
}
