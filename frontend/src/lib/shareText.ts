const EMOJI_MAP: Record<string, string> = {
  correct: "\u{1F7E9}",
  close: "\u{1F7E8}",
  wrong: "\u{1F7E5}",
}

export function buildShareText(
  stats: { rounds: number; correct: number; bestStreak: number; points: number },
  roundStates: string[]
): string {
  const emojiRow = roundStates
    .filter((s) => s !== "current" && s !== "pending")
    .map((s) => EMOJI_MAP[s] ?? "\u{2B1C}")
    .join("")

  const lines = [
    "\u{1F3B5} Blindify \u{2014} Blind Test",
    `Score: ${stats.points} pts | ${stats.correct}/${stats.rounds} correct`,
    `S\u00E9rie max: ${stats.bestStreak} \u{1F525}`,
    "",
    emojiRow,
    "",
    "tymmerc.eu/blindify",
  ]

  return lines.join("\n")
}
