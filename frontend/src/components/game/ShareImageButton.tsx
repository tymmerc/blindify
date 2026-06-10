"use client"

import { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { generateScoreCard } from "@/lib/scoreCardCanvas"

export interface ShareImageButtonProps {
  stats: { rounds: number; correct: number; bestStreak: number; points: number }
  roundStates: string[]
  tracks: Array<{ title: string; artist: string }>
}

export function ShareImageButton({ stats, roundStates, tracks }: ShareImageButtonProps) {
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
          title: "Blindify Score",
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

  return (
    <Button
      variant="outline"
      className="border-2 border-[#a855f7] bg-transparent text-[#a855f7] hover:bg-[#a855f7]/10"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? "⏳" : "📸"} Image
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
