/**
 * Du titre d'une video YouTube au morceau a chercher dans Deezer.
 *
 * Une video de playlist donne un titre libre et le nom de la chaine :
 *   "IAM - Demain c'est loin (Clip officiel)"            chaine "IAM Officiel"
 *   "Dis-moi pas ça"                                      chaine "Okoumé - Topic"
 *   "Trois nuits par semaine - Indochine"                 chaine "metaleuse80"
 * On retire le bruit (clip officiel, lyrics, HD, ft., @pseudo...), on coupe
 * "Artiste - Titre", et on rend au plus deux essais de recherche, le plus sur
 * d'abord. Le choix du bon enregistrement reste a pickMatch (previewMatch.ts) :
 * meme titre, memes mentions de version, bon artiste.
 */

export interface YoutubeSearch {
  title: string;
  /** Absent : artiste inconnu (chaine d'un particulier, rien dans le titre). */
  artist?: string;
}

// Mots de version : une parenthese qui en contient un change l'enregistrement,
// on la garde (pickMatch exigera la meme version chez Deezer).
const VERSION_WORDS = /\b(live|acousti\w*|remix|rmx|version|edit|cover|karaoke|instrumental|unplugged|piano|slowed|sped|reverb|extended|session|medley|demo|mashup)\b/;

// Bruit d'une video : ce qui ne fait pas partie du titre du morceau.
const NOISE_WORDS = new RegExp(
  "\\b(" + [
    "official", "officiel+e?", "clip", "videoclip", "video", "music", "musique", "lyrics?", "paroles",
    "audio", "visuali[sz]er", "visual", "hd", "hq", "4k", "1080p", "720p", "mv", "m v", "upgrade",
    "remaster\\w*", "colors show", "a colors show", "vevo", "explicit", "clean", "nouveaute", "exclu\\w*",
  ].join("|") + ")\\b",
);
const YEAR_ONLY = /^(19|20)\d{2}$/;
const FEAT = /\s(?:feat|ft|featuring|avec)\b\.?\s.*$/i;
const INVISIBLE = /[\u200B-\u200F\u2060-\u206F\uFEFF]/g;
// Pictogrammes et emoji : ils ne sont jamais dans un titre Deezer.
const PICTOGRAPHS = /\p{Extended_Pictographic}|\uFE0F/gu;
const FILE_EXTENSION = /\.(wmv|avi|mp4|mov|flv|mkv|mp3)$/i;
// Separateur artiste / titre : un tiret avec au moins un espace a cote, ou un
// tiret colle a des guillemets ("Pagliaro-''J'entends''"). "Jean-Jacques" reste entier.
const SEPARATOR = /\s+[-–—]\s*|\s*[-–—]\s+|[-–—](?=['"«“‘])/;
// Guillemets autour d'un titre : "Pas l'Temps Pour Les Regrets", ''J'entends Frapper''.
const QUOTED = /^(?:''|["«“‘])\s*(.+?)\s*(?:''|["»”’])$/;

/** Minuscules, sans accents ni ponctuation : pour comparer, jamais pour chercher. */
function plain(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isNoise(fragment: string): boolean {
  const p = plain(fragment);
  if (!p) return true;
  if (YEAR_ONLY.test(p)) return true;
  if (VERSION_WORDS.test(p)) return false;
  // Bruit seulement : chaque mot est du bruit (ou une annee, un "de").
  const rest = p.replace(new RegExp(NOISE_WORDS.source, "g"), " ").replace(/\b((19|20)\d{2}|de|du|la|le|l|en|in|the|of|by|version)\b/g, " ").trim();
  return rest === "";
}

function squeeze(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Retire le bruit d'un titre de video, en gardant les mentions de version. */
export function stripNoise(raw: string): string {
  let text = raw.replace(INVISIBLE, " ").replace(PICTOGRAPHS, " ").replace(FILE_EXTENSION, "");
  // "| A COLORS SHOW", "// Clip", "#rapfr" : ce qui suit est de la presentation.
  text = text.replace(/\s(\||\/\/)\s.*$/, "").replace(/(^|\s)#[\p{L}\p{N}_]+/gu, " ");
  // @pseudo : on garde le nom sans l'arobase.
  text = text.replace(/@([\p{L}\p{N}_.]+)/gu, "$1");
  // Parentheses et crochets de bruit.
  text = text.replace(/\(([^)]*)\)|\[([^\]]*)\]|【([^】]*)】/g, (whole, a, b, c) => (isNoise(a ?? b ?? c ?? "") ? " " : whole));
  // Bruit en fin de titre, sans parentheses : "- Clip Officiel", "clip officiel", "Lyrics".
  for (let i = 0; i < 3; i++) {
    const tail = text.match(/(?:\s[-–—]\s|\s)((?:[\p{L}\p{N}]+\s*){1,4})$/u);
    if (!tail || !isNoise(tail[1]) || tail.index === undefined || tail.index === 0) break;
    text = text.slice(0, tail.index);
  }
  return squeeze(text.replace(/\(\s*\)|\[\s*\]/g, " "));
}

function unquote(text: string): string {
  const t = squeeze(text);
  const m = t.match(QUOTED);
  return m ? m[1] : t;
}

/** "Oxmo Puccino feat Lunatic (Booba)" -> "Oxmo Puccino" ; "Lunatic (ALI & BOOBA)" -> "Lunatic". */
function cleanArtist(raw: string): string {
  return squeeze(unquote(raw).replace(FEAT, "").replace(/\([^)]*\)|\[[^\]]*\]/g, " "));
}

/** "Manon B feat. Ryflo (Live)" -> "Manon B (Live)" : le featuring sort, la version reste. */
function cleanTitle(raw: string): string {
  const t = unquote(raw);
  const bracket = t.search(/[([]/);
  const head = bracket === -1 ? t : t.slice(0, bracket);
  const tail = bracket === -1 ? "" : t.slice(bracket);
  return squeeze(`${head.replace(FEAT, "")} ${tail}`.replace(/\((?:feat|ft|featuring)\b[^)]*\)|\[(?:feat|ft|featuring)\b[^\]]*\]/gi, " "));
}

/**
 * Le nom de la chaine, quand il dit l'artiste : "Okoumé - Topic" (chaine
 * automatique YouTube Music), "NTMVEVO", "IAM Officiel". Sinon tel quel.
 */
export function channelArtist(channel: string | null | undefined): { name: string; official: boolean } | null {
  const raw = squeeze((channel ?? "").replace(INVISIBLE, " "));
  if (!raw) return null;
  const topic = raw.match(/^(.+?)\s+-\s+(Topic|Thème)$/i);
  if (topic) return { name: topic[1], official: true };
  const vevo = raw.match(/^(.+?)\s*vevo$/i);
  if (vevo && vevo[1]) return { name: vevo[1], official: true };
  const official = raw.match(/^(.+?)\s*(?:officiel+e?|official|music)$/i);
  if (official && official[1]) return { name: official[1], official: true };
  return { name: raw, official: false };
}

/** Le nom de chaine colle ("JeanJGoldman", "TearsForFears") face a un artiste ecrit. */
function sameName(channel: string, artist: string): boolean {
  const a = plain(channel).replace(/\s/g, "");
  const b = plain(artist).replace(/\s/g, "");
  return Boolean(a && b) && (a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b)));
}

/**
 * Le premier artiste seulement : "CENTRAL CEE X JRK 19" ou "Lady Gaga, Bruno
 * Mars" brouillent la recherche libre de Deezer, et pickMatch se contente d'un
 * artiste reconnu. "Bello&Dallas" (sans espaces) reste un seul nom.
 */
function firstArtist(artist: string): string {
  return artist.split(/\s*,\s*|\s+(?:x|&)\s+/i)[0] ?? artist;
}

function search(title: string, artist?: string): YoutubeSearch | null {
  const t = cleanTitle(title);
  if (!plain(t)) return null;
  const a = artist ? firstArtist(cleanArtist(artist)) : "";
  return plain(a) ? { title: t, artist: a } : { title: t };
}

/**
 * Les recherches a tenter pour une video, la plus sure d'abord, au plus deux.
 * - "Artiste - Titre" : dans cet ordre, puis a l'envers si la chaine ne
 *   confirme pas le cote de l'artiste ("Trois nuits par semaine - Indochine").
 * - Titre seul : la chaine comme artiste ; si ce n'est pas une chaine
 *   d'artiste (un particulier), un second essai sans artiste.
 */
export function youtubeSearches(videoTitle: string, channelTitle?: string | null): YoutubeSearch[] {
  const cleaned = stripNoise(videoTitle ?? "");
  if (!plain(cleaned)) return [];
  const channel = channelArtist(channelTitle);
  const out: YoutubeSearch[] = [];
  const push = (s: YoutubeSearch | null) => {
    if (s && !out.some(o => o.title === s.title && o.artist === s.artist)) out.push(s);
  };

  const sep = cleaned.match(SEPARATOR);
  if (sep && sep.index !== undefined && sep.index > 0) {
    const left = cleaned.slice(0, sep.index);
    const right = stripNoise(cleaned.slice(sep.index + sep[0].length));
    if (!plain(right)) {
      // "Embarque ma belle - vidéoclip" : il ne reste que le titre.
      push(search(left, channel?.official ? channel.name : undefined));
      if (channel && !channel.official) push(search(left, channel.name));
      return out.slice(0, 2);
    }
    const channelSaysRight = channel ? sameName(channel.name, right) && !sameName(channel.name, left) : false;
    if (channelSaysRight) {
      push(search(left, right));
      return out.slice(0, 1);
    }
    push(search(right, left));
    const channelSaysLeft = channel ? sameName(channel.name, left) : false;
    if (!channelSaysLeft) push(search(left, right));
    return out.slice(0, 2);
  }

  if (channel?.official) {
    push(search(cleaned, channel.name));
    return out.slice(0, 1);
  }
  if (channel) push(search(cleaned, channel.name));
  push(search(cleaned));
  return out.slice(0, 2);
}
