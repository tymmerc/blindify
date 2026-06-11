"use client"

import { useState, useCallback } from "react"

export interface HintButtonProps {
  track: { title: string; artist: string }
  disabled: boolean
  onHintUsed: () => void
}

export function HintButton({ track, disabled, onHintUsed }: HintButtonProps) {
  const [titleRevealed, setTitleRevealed] = useState(false)
  const [artistRevealed, setArtistRevealed] = useState(false)

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
          className="rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#e0a32e] hover:text-[#2e2014] disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {titleRevealed ? `Commence par : ${titleFirstLetter}...` : "Indice · Titre"}
        </button>
        <button
          type="button"
          onClick={handleArtistHint}
          disabled={disabled || artistRevealed}
          className="rounded-full border-[1.5px] border-[#2e2014] bg-transparent px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#e0a32e] hover:text-[#2e2014] disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {artistRevealed ? `Artiste commence par : ${artistFirstLetter}...` : "Indice · Artiste"}
        </button>
      </div>
      {(titleRevealed || artistRevealed) && (
        <div className="flex gap-2">
          {titleRevealed && (
            <span className="rounded-full border-[1.5px] border-[#e0a32e] bg-[#e0a32e]/15 px-3 py-1 text-[11px] font-bold text-[#a87714]">
              Commence par : {titleFirstLetter}...
            </span>
          )}
          {artistRevealed && (
            <span className="rounded-full border-[1.5px] border-[#e0a32e] bg-[#e0a32e]/15 px-3 py-1 text-[11px] font-bold text-[#a87714]">
              Artiste commence par : {artistFirstLetter}...
            </span>
          )}
        </div>
      )}
    </div>
  )
}
