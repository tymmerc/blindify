"use client"

const glowKeyframes = `
@keyframes streakWarm {
  0%, 100% { background-color: rgba(224, 163, 46, 0.15); }
  50% { background-color: rgba(224, 163, 46, 0.35); }
}
@keyframes streakWarmIntense {
  0%, 100% { background-color: rgba(198, 81, 51, 0.18); }
  50% { background-color: rgba(198, 81, 51, 0.4); }
}
@keyframes streakPulse {
  0%, 100% { border-color: rgba(224, 163, 46, 0.5); }
  50% { border-color: rgba(224, 163, 46, 1); }
}
`

export function StreakEffects({ streak }: { streak: number }) {
  if (streak < 2) return null

  const isIntense = streak >= 5

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: glowKeyframes }} />
      <span className="inline-flex items-center gap-1">
        <span
          className={`rounded-full border-[1.5px] px-2 py-0.5 text-xs font-bold ${
            isIntense ? "border-[#c65133] text-[#c65133]" : "border-[#e0a32e] text-[#a87714]"
          }`}
          style={{
            animation: isIntense
              ? "streakWarmIntense 1.5s ease-in-out infinite"
              : "streakWarm 2s ease-in-out infinite",
          }}
        >
          {streak}x{streak >= 3 ? " · en feu" : ""}
        </span>
      </span>
    </>
  )
}

export function useStreakCardStyle(streak: number): React.CSSProperties | undefined {
  if (streak < 5) return undefined

  return {
    animation: "streakPulse 1.5s ease-in-out infinite",
  }
}
