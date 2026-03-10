export type Verdict = "correct" | "close" | "wrong"

// --- Normalization ---

const NORMALIZE_SUBS: Record<string, string> = {
  $: "s",
  "@": "a",
  "\u20ac": "e",
  "&": "and",
}

export function normalize(text: string): string {
  const folded = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  const replaced = folded.replace(/[@$€&]/g, char => NORMALIZE_SUBS[char] ?? " ")
  return replaced.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
}

const STOP_WORDS = new Set(["feat", "featuring", "feat.", "ft", "ft.", "with", "and", "x", "feat,", "featuring,"])

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(Boolean)
    .filter(word => !STOP_WORDS.has(word))
}

// --- Levenshtein ---

export function levenshteinDistance(a: string, b: string): number {
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

export function isWordMatch(word: string, candidates: string[]): boolean {
  if (candidates.includes(word)) return true
  const tolerance = word.length <= 4 ? 1 : 2
  return candidates.some(candidate => {
    if (Math.abs(candidate.length - word.length) > tolerance) return false
    return levenshteinDistance(word, candidate) <= tolerance
  })
}

// --- Guess evaluation ---

export type GuessDetail = {
  verdict: Verdict
  matchedTitle: boolean
  matchedArtist: boolean
  guessProvided: boolean
}

type TrackInfo = { title: string; artist: string }

/**
 * Evaluate a single combined guess string against a track.
 */
export function evaluateGuess(guess: string, track: TrackInfo): GuessDetail {
  const guessWords = tokenize(guess)
  const guessProvided = guessWords.length > 0
  if (!guessProvided) return { verdict: "wrong", matchedTitle: false, matchedArtist: false, guessProvided: false }

  const titleWords = tokenize(track.title)
  const artistWords = tokenize(track.artist)

  // Check if all title/artist tokens are matched by guess tokens (with fuzzy tolerance)
  const matchedTitle = titleWords.length > 0 && titleWords.every(w => isWordMatch(w, guessWords))
  const matchedArtist = artistWords.length > 0 && artistWords.every(w => isWordMatch(w, guessWords))

  let verdict: Verdict = "wrong"
  if (matchedTitle && matchedArtist) verdict = "correct"
  else if (matchedTitle || matchedArtist) verdict = "close"

  return { verdict, matchedTitle, matchedArtist, guessProvided }
}

/**
 * Evaluate separate title and artist guesses against a track.
 */
export function evaluateGuessSeparate(
  guessTitle: string | null | undefined,
  guessArtist: string | null | undefined,
  track: TrackInfo,
): GuessDetail {
  const titleInput = guessTitle?.trim() ?? ""
  const artistInput = guessArtist?.trim() ?? ""
  const guessProvided = titleInput.length > 0 || artistInput.length > 0
  if (!guessProvided) return { verdict: "wrong", matchedTitle: false, matchedArtist: false, guessProvided: false }

  const titleWords = tokenize(track.title)
  const artistWords = tokenize(track.artist)

  let matchedTitle = false
  if (titleInput.length > 0) {
    const inputWords = tokenize(titleInput)
    matchedTitle =
      normalize(track.title) === normalize(titleInput) ||
      (inputWords.length > 0 && titleWords.length > 0 && titleWords.every(w => isWordMatch(w, inputWords)))
  }

  let matchedArtist = false
  if (artistInput.length > 0) {
    const inputWords = tokenize(artistInput)
    matchedArtist =
      normalize(track.artist) === normalize(artistInput) ||
      (inputWords.length > 0 && artistWords.length > 0 && artistWords.every(w => isWordMatch(w, inputWords)))
  }

  let verdict: Verdict = "wrong"
  if (matchedTitle && matchedArtist) verdict = "correct"
  else if (matchedTitle || matchedArtist) verdict = "close"

  return { verdict, matchedTitle, matchedArtist, guessProvided }
}
