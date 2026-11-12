/**
 * Comparaison des reponses tapees avec le morceau de la manche (titre,
 * artiste, variantes, fautes de frappe). Fonctions pures, sorties de
 * realtimeGame.ts le 30/10/2026 sans changement de comportement.
 */
import type { RoundTrack, Verdict } from "./realtimeGame";

export type GuessDetail = ReturnType<typeof evaluateGuessDetail>;

// --- string matching helpers ---
const NORMALIZE_SUBS: Record<string, string> = {
  $: "s",
  "@": "a",
  "\u20ac": "e",
  "&": "and",
};

// Apostrophes droite, typographiques, accent grave et apostrophe modificative.
const APOSTROPHE_CHARS = "'\u2019\u2018`\u00b4\u02bc";
const APOSTROPHES = new RegExp(`[${APOSTROPHE_CHARS}]`, "g");
// Sans drapeau g : .test() sur une regex globale garde lastIndex d'un appel a l'autre.
const HAS_APOSTROPHE = new RegExp(`[${APOSTROPHE_CHARS}]`);

/**
 * Deux lectures d'une apostrophe. "split" (historique) la remplace par un
 * espace : "nothing's" -> "nothing s". "join" colle les morceaux :
 * "nothing's" -> "nothings", "l'amour" -> "lamour". Sans "join", le « s » ou
 * le « t » isole devait retrouver un mot tape et « nothing new » etait refuse
 * pour « Nothing's New » (partie 784, 07/11/2026).
 */
type ApostropheMode = "split" | "join";

function normalize(text: string, mode: ApostropheMode = "split"): string {
  const source = mode === "join" ? text.replace(APOSTROPHES, "") : text;
  const folded = source
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const replaced = folded.replace(/[@$€&]/g, char => NORMALIZE_SUBS[char] ?? " ");
  return replaced.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const STOP_WORDS = new Set(["feat", "featuring", "feat.", "ft", "ft.", "with", "and", "x", "feat,", "featuring,"]);

function tokenize(text: string, mode: ApostropheMode = "split"): string[] {
  return normalize(text, mode)
    .split(" ")
    .filter(Boolean)
    .filter(word => !STOP_WORDS.has(word));
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function isWordMatch(word: string, candidates: string[]): boolean {
  if (candidates.includes(word)) return true;
  const tolerance = word.length <= 4 ? 1 : 2;
  return candidates.some(candidate => {
    if (Math.abs(candidate.length - word.length) > tolerance) return false;
    return levenshteinDistance(word, candidate) <= tolerance;
  });
}

/**
 * La saisie valide-t-elle cette variante (titre ou artiste) ? Egalite apres
 * normalisation, ou chaque mot de la variante retrouve un mot tape (fautes
 * tolerees par isWordMatch). Chaque lecture de l'apostrophe est essayee a part,
 * la meme des deux cotes : "split" garde le comportement d'avant
 * (« rock n roll » pour « Rock'n'Roll »), "join" accepte « dont » pour « Don't ».
 */
function matchesVariant(input: string, variant: string): boolean {
  const modes: ApostropheMode[] =
    HAS_APOSTROPHE.test(input) || HAS_APOSTROPHE.test(variant) ? ["split", "join"] : ["split"];
  return modes.some(mode => {
    if (normalize(variant, mode) === normalize(input, mode)) return true;
    const inputTokens = tokenize(input, mode);
    const variantTokens = tokenize(variant, mode);
    return (
      inputTokens.length > 0 && variantTokens.length > 0 && variantTokens.every(tok => isWordMatch(tok, inputTokens))
    );
  });
}


/**
 * Variantes acceptees d'un TITRE : le titre complet, et le titre "de base"
 * sans les parentheses/crochets ni les suffixes " - Radio Edit" & co.
 * "Chocolat (feat. Awa Imani)" -> taper "chocolat" suffit.
 */
function titleVariants(title: string): string[] {
  const variants = [title];
  const stripped = title
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .split(" - ")[0]
    .trim();
  if (stripped && stripped.toLowerCase() !== title.toLowerCase()) variants.push(stripped);
  return variants;
}

/**
 * Variantes acceptees d'un ARTISTE : la liste complete, et chaque artiste seul.
 * "Naza, Awa Imani" -> "naza" valide, "awa imani" aussi (le feat compte).
 */
function artistVariants(artist: string): string[] {
  const variants = [artist];
  const parts = artist
    .split(/,|;|\/|&|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bavec\b|\bwith\b|\bvs\.?\b|\bx\b|×/i)
    .map(p => p.trim())
    .filter(p => p.length > 1);
  for (const p of parts) {
    if (p.toLowerCase() !== artist.toLowerCase()) variants.push(p);
  }
  return variants;
}

export function evaluateGuessDetail(
  guess: string,
  track: Pick<RoundTrack, "title" | "artist">,
  separateTitle?: string | null,
  separateArtist?: string | null,
): {
  verdict: Verdict;
  matchedTitle: boolean;
  matchedArtist: boolean;
  guessProvided: boolean;
} {
  const hasSeparateFields = (separateTitle && separateTitle.trim().length > 0) || (separateArtist && separateArtist.trim().length > 0);

  if (hasSeparateFields) {
    // Structured matching, CROSS-FIELD : chaque champ est teste contre le titre
    // ET l'artiste. Taper "damso" dans le champ titre doit valider l'artiste -
    // c'est un comportement humain courant (vu en test reel avec des joueurs).
    const titleInput = separateTitle?.trim() ?? "";
    const artistInput = separateArtist?.trim() ?? "";
    const guessProvided = titleInput.length > 0 || artistInput.length > 0;

    const titleVars = titleVariants(track.title);
    const artistVars = artistVariants(track.artist);

    const matchesAnyVariant = (input: string, variants: string[]): boolean =>
      input.length > 0 && variants.some(variant => matchesVariant(input, variant));

    const titleByTitle = matchesAnyVariant(titleInput, titleVars);
    const titleByArtistField = matchesAnyVariant(artistInput, titleVars);
    const artistByArtist = matchesAnyVariant(artistInput, artistVars);
    const artistByTitleField = matchesAnyVariant(titleInput, artistVars);

    // Chaque champ ne credite qu'un seul element (pas de double comptage si
    // l'utilisateur tape la meme chose dans les deux champs).
    const matchedTitle = titleByTitle || (titleByArtistField && !artistByArtist);
    const matchedArtist = artistByArtist || (artistByTitleField && !titleByTitle);

    let verdict: Verdict = "wrong";
    if (matchedTitle && matchedArtist) verdict = "correct";
    else if (matchedTitle || matchedArtist) verdict = "close";

    return { verdict, matchedTitle, matchedArtist, guessProvided };
  }

  // Legacy: single combined guess string
  const normalizedGuess = normalize(guess);
  const guessProvided = normalizedGuess.length > 0;

  // Saisie vide apres normalisation : aucun mot, rien ne peut valider.
  const anyVariant = (variants: string[]): boolean =>
    guessProvided && variants.some(variant => matchesVariant(guess, variant));

  const matchedTitle = anyVariant(titleVariants(track.title));
  const matchedArtist = anyVariant(artistVariants(track.artist));

  let verdict: Verdict = "wrong";
  if (matchedTitle && matchedArtist) verdict = "correct";
  else if (matchedTitle || matchedArtist) verdict = "close";

  return { verdict, matchedTitle, matchedArtist, guessProvided };
}
