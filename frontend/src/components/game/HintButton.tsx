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
          className="rounded-lg border border-[#a855f7]/50 bg-transparent px-3 py-1.5 text-xs font-medium text-[#a855f7] transition hover:border-[#a855f7] hover:bg-[#a855f7]/10 disabled:opacity-40 disabled:hover:border-[#a855f7]/50 disabled:hover:bg-transparent"
        >
          {titleRevealed ? `Commence par : ${titleFirstLetter}...` : "💡 Titre"}
        </button>
        <button
          type="button"
          onClick={handleArtistHint}
          disabled={disabled || artistRevealed}
          className="rounded-lg border border-[#a855f7]/50 bg-transparent px-3 py-1.5 text-xs font-medium text-[#a855f7] transition hover:border-[#a855f7] hover:bg-[#a855f7]/10 disabled:opacity-40 disabled:hover:border-[#a855f7]/50 disabled:hover:bg-transparent"
        >
          {artistRevealed ? `Artiste commence par : ${artistFirstLetter}...` : "💡 Artiste"}
        </button>
      </div>
      {(titleRevealed || artistRevealed) && (
        <div className="flex gap-2">
          {titleRevealed && (
            <span className="rounded-full border border-[#a855f7]/30 bg-[#a855f7]/10 px-3 py-1 text-[11px] text-[#a855f7]">
              Commence par : {titleFirstLetter}...
            </span>
          )}
          {artistRevealed && (
            <span className="rounded-full border border-[#a855f7]/30 bg-[#a855f7]/10 px-3 py-1 text-[11px] text-[#a855f7]">
              Artiste commence par : {artistFirstLetter}...
            </span>
          )}
        </div>
      )}
    </div>
  )
}
