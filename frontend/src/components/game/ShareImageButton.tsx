"use client"

import { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { generateScoreCard } from "@/lib/scoreCardCanvas"

export interface ShareImageButtonProps {
  stats: { rounds: number; correct: number; bestStreak: number; points: number }
  roundStates: string[]
  tracks: Array<{ title: string; artist: string }>
  /** Remplace le style par defaut (bouton carte), ex. lien discret en fin de partie. */
  className?: string
}

const DEFAULT_CLASS = "rounded-md border-2 border-[#2e2014] bg-[#ece1c8] font-bold text-[#2e2014] shadow-[3px_3px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#ece1c8] hover:text-[#2e2014] hover:shadow-[1px_1px_0_#2e2014]"

export function ShareImageButton({ stats, roundStates, tracks, className }: ShareImageButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = useCallback(async () => {
    setLoading(true)
    try {
      const blob = await generateScoreCard(stats, roundStates, tracks)
      const file = new File([blob], "blindify-score.png", { type: "image/png" })

      const canShareFiles =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })

      if (canShareFiles) {
        await navigator.share({
          files: [file],
          title: "Blindz Score",
        })
      } else {
        downloadBlob(blob, "blindify-score.png")
      }
    } catch (err: unknown) {
      // AbortError means user cancelled the share dialog — not a real error
      if (err instanceof DOMException && err.name === "AbortError") return
      console.error("ShareImageButton error:", err)
    } finally {
      setLoading(false)
    }
  }, [stats, roundStates, tracks])

  if (className) {
    return (
      <button type="button" className={className} onClick={handleClick} disabled={loading}>
        {loading ? "Génération..." : "Partager l'image"}
      </button>
    )
  }
  return (
    <Button variant="outline" className={DEFAULT_CLASS} onClick={handleClick} disabled={loading}>
      {loading ? "Génération..." : "Partager l'image"}
    </Button>
  )
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
