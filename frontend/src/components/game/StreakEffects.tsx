"use client"

const glowKeyframes = `
@keyframes streakGlow {
  0%, 100% { box-shadow: 0 0 8px 2px rgba(168, 85, 247, 0.4); }
  50% { box-shadow: 0 0 16px 4px rgba(168, 85, 247, 0.7); }
}
@keyframes streakGlowIntense {
  0%, 100% { box-shadow: 0 0 12px 4px rgba(168, 85, 247, 0.6); }
  50% { box-shadow: 0 0 24px 8px rgba(168, 85, 247, 0.9); }
}
@keyframes streakPulse {
  0%, 100% { border-color: rgba(168, 85, 247, 0.5); }
  50% { border-color: rgba(168, 85, 247, 1); }
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
          className="rounded-md px-2 py-0.5 text-xs font-bold text-[#a855f7]"
          style={{
            animation: isIntense
              ? "streakGlowIntense 1.5s ease-in-out infinite"
              : "streakGlow 2s ease-in-out infinite",
          }}
        >
          {streak}x
        </span>
        {streak >= 3 && <span className="text-sm">{"\u{1F525}"}</span>}
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
