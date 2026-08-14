// Port client du matching flou du serveur (backend/src/services/realtimeGame.ts).
// Utilise par le mode "un seul tel" : la validation est locale puisque le jeu
// entier se joue sur un seul appareil, pas de triche possible par construction.

export type GuessVerdict = "correct" | "close" | "wrong"

const NORMALIZE_SUBS: Record<string, string> = { "@": "a", $: "s", "€": "e", "&": " and " }

function normalize(text: string): string {
  const folded = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
  const replaced = folded.replace(/[@$€&]/g, char => NORMALIZE_SUBS[char] ?? " ")
  return replaced.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
}

const STOP_WORDS = new Set(["feat", "featuring", "feat.", "ft", "ft.", "with", "and", "x", "feat,", "featuring,"])

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(Boolean)
    .filter(word => !STOP_WORDS.has(word))
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[a.length][b.length]
}

function isWordMatch(word: string, candidates: string[]): boolean {
  if (candidates.includes(word)) return true
  const tolerance = word.length <= 4 ? 1 : 2
  return candidates.some(candidate => {
    if (Math.abs(candidate.length - word.length) > tolerance) return false
    return levenshteinDistance(word, candidate) <= tolerance
  })
}

/**
 * Matching CROSS-FIELD, comme sur le serveur : chaque champ est teste contre le
 * titre ET l'artiste (taper "damso" dans le champ titre doit valider l'artiste).
 */
export function evaluateGuess(
  titleInput: string,
  artistInput: string,
  track: { title: string; artist: string },
): { verdict: GuessVerdict; matchedTitle: boolean; matchedArtist: boolean } {
  const titleTokens = tokenize(track.title)
  const artistTokens = tokenize(track.artist)

  const inputMatches = (input: string, target: string, targetTokens: string[]): boolean => {
    if (!input.trim()) return false
    const inputTokens = tokenize(input)
    return (
      normalize(target) === normalize(input) ||
      (inputTokens.length > 0 && targetTokens.length > 0 && targetTokens.every(tok => isWordMatch(tok, inputTokens)))
    )
  }

  const titleByTitle = inputMatches(titleInput, track.title, titleTokens)
  const titleByArtistField = inputMatches(artistInput, track.title, titleTokens)
  const artistByArtist = inputMatches(artistInput, track.artist, artistTokens)
  const artistByTitleField = inputMatches(titleInput, track.artist, artistTokens)

  const matchedTitle = titleByTitle || (titleByArtistField && !artistByArtist)
  const matchedArtist = artistByArtist || (artistByTitleField && !titleByTitle)

  let verdict: GuessVerdict = "wrong"
  if (matchedTitle && matchedArtist) verdict = "correct"
  else if (matchedTitle || matchedArtist) verdict = "close"

  return { verdict, matchedTitle, matchedArtist }
}
