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

function isWordMatch(word: string, candidates: string[], maxTypos = 2): boolean {
  if (candidates.includes(word)) return true;
  const tolerance = Math.min(word.length <= 4 ? 1 : 2, maxTypos);
  return candidates.some(candidate => {
    if (Math.abs(candidate.length - word.length) > tolerance) return false;
    return levenshteinDistance(word, candidate) <= tolerance;
  });
}

/**
 * Saisie et variante comparees sans aucun espace : « bubblegum » pour
 * « Bubble Gum », « karolg » pour « KAROL G » (soiree du 12/11/2026). La
 * tolerance est plus serree que mot a mot, sinon « bad bi » validerait « baby ».
 * Une lettre de plus ou de moins coute une faute de la tolerance : sans ca,
 * « kill » validait « kill 2 » et « I love you » « I Love You So ».
 */
function isJoinedMatch(input: string, variant: string, maxTypos: number): boolean {
  if (!input || !variant) return false;
  const lengthGap = Math.abs(input.length - variant.length);
  if (lengthGap > 1) return false;
  const tolerance = Math.min(variant.length <= 4 ? 0 : variant.length <= 8 ? 1 : 2, maxTypos) - lengthGap;
  if (tolerance < 0) return false;
  return levenshteinDistance(input, variant) <= tolerance;
}

/**
 * Une forme acceptee du titre ou de l'artiste. maxTypos plafonne les fautes par
 * mot : 2 en general, 1 sur une fin de titre (voir titleEndings). titleWords,
 * pose sur les fins de titre seulement : chaque mot tape doit aussi exister
 * dans ce titre, sinon « rock that body » validerait « The Rock » via « rock ».
 */
type Variant = { text: string; maxTypos: number; titleWords?: string };

/**
 * La saisie valide-t-elle cette variante (titre ou artiste) ? Egalite apres
 * normalisation, ou chaque mot de la variante retrouve un mot tape (fautes
 * tolerees par isWordMatch), ou les deux colles sans espaces. Chaque lecture de
 * l'apostrophe est essayee a part, la meme des deux cotes : "split" garde le
 * comportement d'avant (« rock n roll » pour « Rock'n'Roll »), "join" accepte
 * « dont » pour « Don't ».
 */
function matchesVariant(input: string, { text: variant, maxTypos, titleWords }: Variant, otherWords = ""): boolean {
  const modes: ApostropheMode[] =
    HAS_APOSTROPHE.test(input) || HAS_APOSTROPHE.test(variant) ? ["split", "join"] : ["split"];
  return modes.some(mode => {
    const normalizedVariant = normalize(variant, mode);
    const normalizedInput = normalize(input, mode);
    if (normalizedVariant === normalizedInput) return true;
    if (isJoinedMatch(normalizedInput.replace(/ /g, ""), normalizedVariant.replace(/ /g, ""), maxTypos)) return true;
    const inputTokens = tokenize(input, mode);
    const variantTokens = tokenize(variant, mode);
    if (!inputTokens.length || !variantTokens.length) return false;
    if (!variantTokens.every(tok => isWordMatch(tok, inputTokens, maxTypos))) return false;
    if (titleWords === undefined) return true;
    const allowed = tokenize(`${titleWords} ${otherWords}`, mode);
    return inputTokens.every(tok => allowed.some(word => isWordMatch(word, [tok], maxTypos)));
  });
}


// Articles qu'on peut omettre en tete de titre : « kill 2 » pour « the kill 2 ».
const LEADING_ARTICLES = new Set(["the", "a", "an", "le", "la", "les", "l", "un", "une"]);
// Une negation ne s'omet jamais : « stop me now » ne vaut pas « Don't Stop Me
// Now ». Formes lues sans apostrophe (« don't » -> « dont »).
const NEGATIONS = new Set([
  "dont", "doesnt", "didnt", "cant", "couldnt", "wont", "wouldnt", "aint", "isnt", "not", "no", "never",
  "ne", "pas", "jamais", "non",
]);
// Petits mots qui ne portent pas le titre : ils ne comptent pas dans son poids.
const SMALL_WORDS = new Set([
  ...LEADING_ARTICLES,
  "of", "to", "for", "in", "on", "de", "d", "du", "des", "et", "en", "au", "aux",
]);

function contentTokens(text: string): string[] {
  return tokenize(text).filter(tok => !SMALL_WORDS.has(tok));
}

const letterCount = (tokens: string[]): number => tokens.reduce((sum, tok) => sum + tok.length, 0);

/**
 * Fins de titre acceptees seules. On retire des mots au debut du titre, jamais
 * a la fin : le coeur d'un titre est presque toujours a la fin (« break free »,
 * « ophelia », « formidable », « les yeux d'emilie »). Une fin est retenue :
 * - si on n'a retire que des articles (« kill 2 » pour « the kill 2 ») ;
 * - sinon, si la partie retiree ne contient pas de negation, quand la fin
 *   garde au moins 60 % des lettres du titre (petits mots exclus), au moins
 *   4 lettres, ET son mot le plus long. « Ophelia » garde 7 lettres sur 11.
 *   « Ti amo » (5 sur 15) reste refuse pour « Sara perche ti amo », « love
 *   song » (8 sur 19) pour « Love You Like A Love Song », « tonight » (7 sur
 *   13) pour « Save Me Tonight », et « I love you » n'est pas une fin de
 *   « I Love You So ».
 */
function titleEndings(title: string): Variant[] {
  const words = title.split(/\s+/).filter(Boolean);
  const titleContent = contentTokens(title);
  const total = letterCount(titleContent);
  const longest = Math.max(0, ...titleContent.map(tok => tok.length));
  const endings: Variant[] = [];
  for (let cut = 1; cut < words.length; cut++) {
    const ending = words.slice(cut).join(" ");
    if (tokenize(ending).length === 0) continue;
    const dropped = tokenize(words.slice(0, cut).join(" "));
    if (dropped.every(tok => LEADING_ARTICLES.has(tok))) {
      endings.push({ text: ending, maxTypos: 2, titleWords: title });
      continue;
    }
    if (tokenize(words.slice(0, cut).join(" "), "join").some(tok => NEGATIONS.has(tok))) continue;
    const endingContent = contentTokens(ending);
    const weight = letterCount(endingContent);
    if (weight >= 4 && weight * 5 >= total * 3 && endingContent.some(tok => tok.length === longest)) {
      // Une seule faute par mot : sinon « night » retrouve « tonight » et
      // « say my the night » validait « Save Me Tonight ».
      endings.push({ text: ending, maxTypos: 1, titleWords: title });
    }
  }
  return endings;
}

/**
 * Variantes acceptees d'un TITRE : le titre complet, le titre "de base" sans
 * les parentheses/crochets ni les suffixes " - Radio Edit" & co, chaque moitie
 * d'un mashup « A x B », et les fins de ces titres (titleEndings).
 * "Chocolat (feat. Awa Imani)" -> taper "chocolat" suffit.
 */
function titleVariants(title: string): Variant[] {
  const stripped = title
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .split(" - ")[0]
    .trim();
  const base = stripped || title;
  // « Carnival x Fein » : chaque morceau du mashup compte seul. Un x en bout de
  // titre (« Malcolm X ») ne coupe rien.
  const mashupParts = base
    .split(/\s+[x\u00d7]\s+/i)
    .map(part => part.trim())
    .filter(part => part.length > 1);
  const bases = [base, ...(mashupParts.length > 1 ? mashupParts : [])];
  const variants: Variant[] = [...new Set([title, ...bases])].map(text => ({ text, maxTypos: 2 }));
  for (const b of bases) variants.push(...titleEndings(b));
  return variants;
}

/**
 * Variantes acceptees d'un ARTISTE : la liste complete, et chaque artiste seul.
 * "Naza, Awa Imani" -> "naza" valide, "awa imani" aussi (le feat compte).
 */
function artistVariants(artist: string): Variant[] {
  const variants = [artist];
  const parts = artist
    .split(/,|;|\/|&|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bavec\b|\bwith\b|\bvs\.?\b|\bx\b|×/i)
    .map(p => p.trim())
    .filter(p => p.length > 1);
  for (const p of parts) {
    if (p.toLowerCase() !== artist.toLowerCase()) variants.push(p);
  }
  return variants.map(text => ({ text, maxTypos: 2 }));
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

    const matchesAnyVariant = (input: string, variants: Variant[]): boolean =>
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
  // Saisie unique : le titre et l'artiste sont dans la meme chaine, les mots de
  // l'artiste ne disqualifient donc pas une fin de titre.
  const anyVariant = (variants: Variant[], otherWords: string): boolean =>
    guessProvided && variants.some(variant => matchesVariant(guess, variant, otherWords));

  const matchedTitle = anyVariant(titleVariants(track.title), track.artist);
  const matchedArtist = anyVariant(artistVariants(track.artist), track.title);

  let verdict: Verdict = "wrong";
  if (matchedTitle && matchedArtist) verdict = "correct";
  else if (matchedTitle || matchedArtist) verdict = "close";

  return { verdict, matchedTitle, matchedArtist, guessProvided };
}
