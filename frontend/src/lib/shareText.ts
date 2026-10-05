const EMOJI_MAP: Record<string, string> = {
  correct: "\u{1F7E9}",
  close: "\u{1F7E8}",
  wrong: "\u{1F7E5}",
}

/**
 * Texte a coller apres une partie solo. `site` = l'adresse ou l'on joue
 * (siteLabel()), jamais un domaine en dur : l'ancien "tymmerc.eu/blindify"
 * n'etait plus qu'une redirection vers blindz.app.
 */
export function buildShareText(
  stats: { rounds: number; correct: number; bestStreak: number; points: number },
  roundStates: string[],
  site: string
): string {
  const emojiRow = roundStates
    .filter((s) => s !== "current" && s !== "pending")
    .map((s) => EMOJI_MAP[s] ?? "\u{2B1C}")
    .join("")

  const lines = [
    "\u{1F3B5} Blindz, blind test",
    `Score : ${stats.points} pts | ${stats.correct}/${stats.rounds} correct`,
    `S\u00E9rie max : ${stats.bestStreak} \u{1F525}`,
    "",
    emojiRow,
    "",
    site,
  ]

  return lines.join("\n")
}
