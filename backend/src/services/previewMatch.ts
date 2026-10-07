/**
 * Choix de l'extrait Deezer d'un morceau, quand on n'a que son titre.
 *
 * Regle (05/10/2026, "You Say Run" joue dans sa version "Earth-2021") : jamais
 * un autre morceau, et jamais une autre version. Un titre se decoupe en un
 * titre de base et des mentions ("(Live)", " - Remix", "-Succession-", "[...]").
 * Un candidat n'est garde que si sa base ET ses mentions sont celles de la
 * source, une fois retirees les mentions qui ne changent pas l'enregistrement
 * (remaster, featuring, "From ...", radio edit, mono...). Puis la duree :
 * au-dela de 8 s ou 5 % d'ecart, c'est un autre enregistrement.
 */

export interface MatchCandidate {
  id?: number;
  title?: string;
  artist?: { name?: string };
  preview?: string;
  duration?: number; // secondes (format Deezer)
}

export interface MatchQuery {
  title: string;
  artist?: string;
  durationMs?: number | null;
}

export interface ParsedTitle {
  base: string;
  qualifiers: string[];
}

const DURATION_TOLERANCE_MS = 8_000;
const DURATION_TOLERANCE_RATIO = 0.05;

// Mentions sans effet sur l'enregistrement (apres normalisation).
const NEUTRAL_QUALIFIERS: RegExp[] = [
  /^(feat|ft|featuring|with|avec|from|prod)\b/,
  /^bonus( track)?$/,
  /soundtrack$/, // "Original Motion Picture Soundtrack" (pas "Soundtrack Version")
  /\bremaster/, // "Remastered 2011", "2009 Remaster", "Remasterise 2020"
  /^(explicit|clean|mono|stereo)( version)?$/,
  /^(single|album|original|radio|lp)( version| edit| mix)?$/,
];

// "(...)", "[...]", et les crochets pleine chasse des titres japonais.
const BRACKETS = /\(([^)]*)\)|\[([^\]]*)\]|＜([^＞]*)＞|【([^】]*)】/g;
// Sous-titre en fin de titre : " -Succession-", " ~xxx~" (tildes ASCII ou japonais).
const ENCLOSED_SUFFIX = /\s[-~～〜]([^-~～〜]+)[-~～〜]\s*$/;
// " - Live at Wembley", " – Remix" (tiret simple ou demi-cadratin).
const DASH_SUFFIX = /\s[-–]\s(.*)$/;

function normalize(text: string): string {
  return text
    .normalize("NFKD") // accents a part, lettres pleine chasse ramenees en ASCII
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, " ")
    .trim();
}

/** Titre de base + mentions de version significatives, triees. */
export function parseTitle(raw: string): ParsedTitle {
  const segments: string[] = [];
  let rest = raw.replace(BRACKETS, (_m, ...groups: unknown[]) => {
    segments.push(groups.slice(0, 4).find(g => typeof g === "string") as string);
    return " ";
  });
  for (const pattern of [ENCLOSED_SUFFIX, DASH_SUFFIX]) {
    const m = rest.match(pattern);
    if (m) {
      segments.push(m[1]);
      rest = rest.slice(0, m.index);
    }
  }
  const qualifiers = segments
    .flatMap(s => s.split(/[/,;]/))
    .map(normalize)
    .filter(q => q && !NEUTRAL_QUALIFIERS.some(re => re.test(q)));
  return { base: normalize(rest), qualifiers: [...new Set(qualifiers)].sort() };
}


/** Ecart de duree en ms, ou null si l'une des deux est inconnue. */
function durationGap(candidate: MatchCandidate, durationMs?: number | null): number | null {
  if (!durationMs || durationMs <= 0 || !candidate.duration || candidate.duration <= 0) return null;
  return Math.abs(candidate.duration * 1000 - durationMs);
}

function withinTolerance(gap: number | null, durationMs?: number | null): boolean {
  if (gap === null || !durationMs) return true;
  return gap <= Math.max(DURATION_TOLERANCE_MS, durationMs * DURATION_TOLERANCE_RATIO);
}

function sameTitle(a: ParsedTitle, b: ParsedTitle): boolean {
  return a.base === b.base && a.qualifiers.join("|") === b.qualifiers.join("|");
}

/** Meme version que la source : meme titre et memes mentions, duree proche. */
export function isSameVersion(candidate: MatchCandidate, want: MatchQuery): boolean {
  if (!candidate.title) return false;
  const source = parseTitle(want.title);
  return Boolean(source.base) && sameTitle(parseTitle(candidate.title), source)
    && withinTolerance(durationGap(candidate, want.durationMs), want.durationMs);
}

function artistsOf(artist?: string): string[] {
  // "The Weeknd, Rosalia" ou "A feat. B" : chaque artiste compte.
  return (artist ?? "")
    .split(/,|&|\bfeat\.?|\bft\.?|\bx\b/i)
    .map(normalize)
    .filter(Boolean);
}

/**
 * Le bon enregistrement parmi les resultats d'une recherche, ou null. Parmi
 * les candidats surs : le bon artiste (obligatoire si on le connait), avec un
 * extrait de preference, puis la duree la plus proche.
 */
export function pickMatch<T extends MatchCandidate>(items: T[], want: MatchQuery): T | null {
  const wantArtists = artistsOf(want.artist);
  const sameArtist = (i: T) => {
    const got = normalize(i.artist?.name ?? "");
    return wantArtists.length === 0 || wantArtists.some(a => got.includes(a) || a.includes(got));
  };
  const safe = items
    .filter(i => i.id && isSameVersion(i, want) && sameArtist(i))
    .map(i => ({ i, gap: durationGap(i, want.durationMs) }));
  const ranked = [...safe].sort((a, b) =>
    Number(Boolean(b.i.preview)) - Number(Boolean(a.i.preview)) || (a.gap ?? 0) - (b.gap ?? 0)
  );
  return ranked[0]?.i ?? null;
}

/**
 * Texte de la recherche libre Deezer : titre sans ses mentions de version
 * ("- Remastered 2011", "(Radio Edit)"), qui brouillent la recherche ;
 * pickMatch, lui, les compare.
 */
export function searchQueryFor(title: string, artist?: string): string {
  const searchTitle = title.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\s-\s.*$/, "").replace(/\s+/g, " ").trim() || title;
  return artist ? `${searchTitle} ${artist}` : searchTitle;
}

/** ISRC : 2 lettres de pays, 3 caracteres d'emetteur, 7 chiffres. */
export function isIsrc(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(value);
}
