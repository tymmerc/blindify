/**
 * Chat Twitch du mode streamer (T5b) : lecture des lignes IRC et des reponses
 * `!b titre - artiste`. Fonctions pures.
 *
 * Twitch sert son chat en IRC sur WebSocket. On le lit en anonyme (pseudo
 * justinfan…) : aucun compte, aucun secret, lecture seule.
 * Reference : https://dev.twitch.tv/docs/chat/irc/
 */

/** Nom de chaine Twitch : 3 a 25 caracteres, minuscules, chiffres, souligne. */
export const CHANNEL_FORMAT = /^[a-z0-9_]{3,25}$/;
/** Prefixe obligatoire : sans lui, le chat normal serait pris pour des reponses. */
export const ANSWER_PREFIX = "!b";
const MAX_ANSWER_LEN = 120;
const MAX_LINE_LEN = 4_096;

/** Longueur au-dela de laquelle ce n'est ni un nom ni un lien de chaine. */
const MAX_CHANNEL_INPUT = 100;

function stripTrailingSlashes(value: string): string {
  // Une boucle plutot qu'une expression /\/+$/ : sur une saisie piegee
  // (des milliers de « / »), l'expression devient lente (alerte CodeQL).
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

export function cleanChannel(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > MAX_CHANNEL_INPUT) return null;
  const value = stripTrailingSlashes(raw.trim().toLowerCase().replace(/^#/, "").replace(/^https?:\/\/(www\.)?twitch\.tv\//, ""));
  return CHANNEL_FORMAT.test(value) ? value : null;
}

export interface IrcMessage {
  tags: Record<string, string>;
  prefix: string | null;
  command: string;
  params: string[];
}

function unescapeTag(value: string): string {
  return value.replace(/\\(.)/g, (_, c: string) => (c === "s" ? " " : c === ":" ? ";" : c === "r" ? "\r" : c === "n" ? "\n" : c));
}

/** Une ligne IRC (avec ses tags IRCv3), ou null si elle ne ressemble a rien. */
export function parseIrcLine(raw: string): IrcMessage | null {
  if (!raw || raw.length > MAX_LINE_LEN) return null;
  let rest = raw.replace(/\r?\n$/, "");
  const tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const end = rest.indexOf(" ");
    if (end < 0) return null;
    for (const pair of rest.slice(1, end).split(";")) {
      const eq = pair.indexOf("=");
      if (eq > 0) tags[pair.slice(0, eq)] = unescapeTag(pair.slice(eq + 1));
    }
    rest = rest.slice(end + 1);
  }
  let prefix: string | null = null;
  if (rest.startsWith(":")) {
    const end = rest.indexOf(" ");
    if (end < 0) return null;
    prefix = rest.slice(1, end);
    rest = rest.slice(end + 1);
  }
  const trailingAt = rest.indexOf(" :");
  const head = trailingAt >= 0 ? rest.slice(0, trailingAt) : rest;
  const params = head.split(" ").filter(Boolean);
  const command = params.shift();
  if (!command) return null;
  if (trailingAt >= 0) params.push(rest.slice(trailingAt + 2));
  return { tags, prefix, command: command.toUpperCase(), params };
}

export interface ChatLine {
  channel: string;
  login: string;
  displayName: string;
  text: string;
}

/** Un message du chat (PRIVMSG), avec le pseudo affiche par Twitch. */
export function chatLineOf(msg: IrcMessage): ChatLine | null {
  if (msg.command !== "PRIVMSG" || msg.params.length < 2 || !msg.prefix) return null;
  const login = msg.prefix.split("!")[0]?.toLowerCase() ?? "";
  if (!CHANNEL_FORMAT.test(login)) return null;
  const channel = msg.params[0].replace(/^#/, "");
  const shown = msg.tags["display-name"]?.trim();
  // Un nom affiche exotique (caracteres de controle, trop long) : on garde le login.
  const displayName = shown && shown.length <= 25 && /^[\p{L}\p{N}_ ]+$/u.test(shown) ? shown : login;
  return { channel, login, displayName, text: msg.params[1] };
}

/** Test rapide, avant tout plafond : la ligne ressemble-t-elle a une reponse `!b` ? */
export function looksLikeAnswer(text: string): boolean {
  return /^\s*!b\s/i.test(text);
}

/**
 * `!b titre - artiste` -> { title, artist }. Sans tiret, tout est le titre.
 * Null si le message ne commence pas par `!b` ou ne dit rien.
 */
export function parseChatAnswer(text: string): { title: string; artist: string } | null {
  const trimmed = text.trim();
  const head = trimmed.slice(0, ANSWER_PREFIX.length).toLowerCase();
  if (head !== ANSWER_PREFIX) return null;
  const body = trimmed.slice(ANSWER_PREFIX.length);
  // « !bonjour » n'est pas une reponse : il faut un espace apres le prefixe.
  if (body && !/^\s/.test(body)) return null;
  const answer = body.trim().slice(0, MAX_ANSWER_LEN);
  if (!answer) return null;
  const cut = answer.search(/\s[-–]\s/);
  if (cut < 0) return { title: answer, artist: "" };
  return { title: answer.slice(0, cut).trim(), artist: answer.slice(cut + 3).trim() };
}

/** Pseudo anonyme de lecture : justinfan suivi de chiffres. */
export function anonymousNick(random: () => number = Math.random): string {
  return `justinfan${10_000 + Math.floor(random() * 89_999)}`;
}
