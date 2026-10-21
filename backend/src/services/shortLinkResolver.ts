import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Liens courts du bouton Partager des applis mobiles (link.deezer.com/s/...,
 * spotify.link/...). Ils ne menent a la playlist qu'en suivant une
 * redirection : on la suit cote serveur, mais sous bonne garde, parce que
 * c'est une requete sortante dont l'adresse vient d'un joueur (SSRF).
 *
 *   - depart : une liste fermee d'hotes (SHORT_LINK_HOSTS), en https sur le
 *     port par defaut, sans identifiants. Rien d'autre n'est appele.
 *   - chaque saut est revalide avec les memes regles ; on s'arrete au premier
 *     hote d'arrivee (TARGET_HOSTS), SANS l'appeler : l'adresse rendue passe
 *     ensuite par parseProfileUrl comme un lien colle a la main.
 *   - au plus MAX_REDIRECTS requetes, un delai court, GET sans lire le corps.
 *   - le nom resolu doit donner une adresse publique (safeLookup) : meme une
 *     entree DNS piegee ne peut pas viser la machine ou le reseau prive.
 *   - aucune adresse n'est decodee : on compare les noms d'hote tels que les
 *     normalise l'analyseur WHATWG, et le chemin repart tel quel.
 *
 * Hotes verifies le 17/10/2026 (link.deezer.com : 302 vers www.deezer.com ;
 * spotify.link : 307 vers open.spotify.com) et le 21/10 (spotify.app.link,
 * domaine Branch des memes liens : 307 vers open.spotify.com). deezer.page.link
 * est retire : Firebase Dynamic Links est ferme depuis aout 2025 (404).
 */
export const SHORT_LINK_HOSTS: ReadonlySet<string> = new Set([
  "link.deezer.com",
  "spotify.link",
  "spotify.app.link",
]);

export const TARGET_HOSTS: ReadonlySet<string> = new Set(["www.deezer.com", "deezer.com", "open.spotify.com"]);

export const MAX_REDIRECTS = 5;
/** Delai total de la resolution, tous sauts compris. */
const DEFAULT_TIMEOUT_MS = 6_000;
/** Resolutions en cours en meme temps, tous joueurs confondus. */
const MAX_IN_FLIGHT = 5;
/**
 * Par adresse IP : une resolution a la fois, et au plus 3 en tout (en cours
 * et en attente). Quelques IP qui collent en boucle ne prennent donc jamais
 * plus d'une des 5 places chacune. La limite par minute est a cote
 * (middleware/shortLinkLimiter.ts).
 */
const MAX_QUEUED_PER_CLIENT = 3;
/** Cache des resolutions reussies : le meme lien recolle ne sort pas. */
export const SHORT_LINK_CACHE_TTL_MS = 20 * 60_000;
export const SHORT_LINK_CACHE_MAX = 500;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Le corps n'est jamais lu, mais spotify.link (Branch) sert une page HTML au
// lieu d'une redirection a certains robots : on se presente comme un navigateur.
const USER_AGENT = "Mozilla/5.0";

export type ShortLinkErrorCode =
  | "not_short_link"
  | "redirect_refused"
  | "no_redirect"
  | "too_many_redirects"
  | "not_a_playlist"
  | "unreachable"
  | "busy"
  | "rate_limited";

export class ShortLinkError extends Error {
  constructor(public readonly code: ShortLinkErrorCode, message: string = code) {
    super(message);
    this.name = "ShortLinkError";
  }
}

export interface HopResult {
  status: number;
  location: string | null;
}

/** Une requete, sans suivre la redirection. Remplacable dans les tests. */
export type Hop = (url: URL, timeoutMs: number) => Promise<HopResult>;

export interface ResolveOptions {
  hop?: Hop;
  /** Delai total, tous sauts compris (compte une fois le tour venu). */
  timeoutMs?: number;
  /** Cle du joueur (ipRateLimitKey) : une resolution a la fois par cle. */
  clientKey?: string;
}

/** Adresse https sur le port par defaut, sans identifiants, vers un hote de la liste. */
function allowedUrl(url: URL, hosts: ReadonlySet<string>): boolean {
  return url.protocol === "https:" && url.port === "" && url.username === "" && url.password === "" && hosts.has(url.hostname);
}

function parseUrl(raw: string, base?: URL): URL | null {
  try {
    return new URL(raw, base);
  } catch {
    return null;
  }
}

/**
 * Le lien court en https, ou null. Les ecrans /import, /play et /chrono
 * envoient le texte colle tel quel : un lien sans schema (« spotify.link/x »)
 * recoit https://, un lien en http passe en https. Ensuite les memes controles
 * que tout le reste (hote de la liste, port par defaut, pas d'identifiants).
 */
export function normalizeShortLink(raw: string): string | null {
  const trimmed = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = parseUrl(withScheme);
  if (!url) return null;
  if (url.protocol === "http:") {
    // Un port explicite en http (:8080) reste refuse : il survit au passage en https.
    if (url.port !== "") return null;
    url.protocol = "https:";
  }
  return allowedUrl(url, SHORT_LINK_HOSTS) ? url.toString() : null;
}

export function isShortLink(raw: string): boolean {
  return normalizeShortLink(raw) !== null;
}

let inFlight = 0;
const cache = new Map<string, { target: string; expiresAt: number }>();
const clientQueued = new Map<string, number>();
const clientTail = new Map<string, Promise<void>>();

/** Vide le cache (tests). */
export function clearShortLinkCache(): void {
  cache.clear();
}

function cached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.target;
}

function remember(key: string, target: string): void {
  cache.delete(key);
  cache.set(key, { target, expiresAt: Date.now() + SHORT_LINK_CACHE_TTL_MS });
  // Map garde l'ordre d'insertion : la premiere cle est la plus ancienne.
  while (cache.size > SHORT_LINK_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Attend le tour de cette cle (une resolution a la fois), puis lance fn. */
async function inClientTurn<T>(key: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (key === undefined) return fn();
  const queued = clientQueued.get(key) ?? 0;
  if (queued >= MAX_QUEUED_PER_CLIENT) throw new ShortLinkError("rate_limited");
  clientQueued.set(key, queued + 1);
  const previous = clientTail.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const mine = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => mine);
  clientTail.set(key, tail);
  try {
    await previous;
    return await fn();
  } finally {
    release();
    const left = (clientQueued.get(key) ?? 1) - 1;
    if (left > 0) {
      clientQueued.set(key, left);
    } else {
      clientQueued.delete(key);
      if (clientTail.get(key) === tail) clientTail.delete(key);
    }
  }
}

/**
 * Suit un lien court jusqu'a son adresse d'arrivee (www.deezer.com, deezer.com
 * ou open.spotify.com) et la rend telle quelle. Leve une ShortLinkError sinon.
 */
export async function resolveShortLink(raw: string, options: ResolveOptions = {}): Promise<string> {
  const normalized = normalizeShortLink(raw);
  const start = normalized === null ? null : parseUrl(normalized);
  if (!start) throw new ShortLinkError("not_short_link");
  const key = start.toString();
  const hit = cached(key);
  if (hit) return hit;

  return inClientTurn(options.clientKey, async () => {
    // Un lien identique a pu aboutir pendant l'attente.
    const late = cached(key);
    if (late) return late;
    if (inFlight >= MAX_IN_FLIGHT) throw new ShortLinkError("busy");
    inFlight += 1;
    try {
      const target = await follow(start, options.hop ?? httpsHop, Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
      remember(key, target);
      return target;
    } finally {
      inFlight -= 1;
    }
  });
}

async function follow(start: URL, hop: Hop, deadline: number): Promise<string> {
  let current = start;
  for (let i = 0; i < MAX_REDIRECTS; i += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ShortLinkError("unreachable", "timeout");
    const next = await followOnce(current, hop, remaining);
    if (allowedUrl(next, TARGET_HOSTS)) return next.toString();
    current = next;
  }
  throw new ShortLinkError("too_many_redirects");
}

/** Un saut : l'adresse suivante, deja validee (hote de depart ou d'arrivee). */
async function followOnce(current: URL, hop: Hop, timeoutMs: number): Promise<URL> {
  let result: HopResult;
  try {
    result = await hop(current, timeoutMs);
  } catch (err) {
    throw new ShortLinkError("unreachable", err instanceof Error ? err.message : "unreachable");
  }
  if (!REDIRECT_STATUSES.has(result.status) || !result.location) {
    throw new ShortLinkError("no_redirect", `status ${result.status}`);
  }
  const next = parseUrl(result.location, current);
  if (!next || !(allowedUrl(next, SHORT_LINK_HOSTS) || allowedUrl(next, TARGET_HOSTS))) {
    throw new ShortLinkError("redirect_refused");
  }
  return next;
}

/** Reponse a donner au joueur quand un lien court n'aboutit pas. */
export function shortLinkFailure(code: ShortLinkErrorCode): { status: number; message: string } {
  if (code === "busy") {
    return { status: 503, message: "Trop de liens courts à ouvrir en même temps. Réessaie dans un instant." };
  }
  if (code === "rate_limited") {
    return { status: 429, message: "Beaucoup de liens courts d'un coup. Attends une minute, ou colle l'adresse complète." };
  }
  if (code === "not_a_playlist") {
    return { status: 400, message: "Ce lien court ne mène pas à une playlist ni à un profil Spotify ou Deezer." };
  }
  return {
    status: 400,
    message: "Ce lien court n'a pas pu être ouvert. Ouvre-le dans ton navigateur et copie l'adresse de la playlist.",
  };
}

// ---------------------------------------------------------------------------
// Adresses publiques seulement
// ---------------------------------------------------------------------------

const BLOCKED = new net.BlockList();
for (const [prefix, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED.addSubnet(prefix, bits, "ipv4");
for (const [prefix, bits] of [
  // ::/96 : IPv4 compatible (::7f00:1 = 127.0.0.1), englobe :: et ::1.
  // 2002::/16 (6to4) et 2001::/32 (Teredo) portent une IPv4 dans l'adresse.
  ["::", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 32], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) BLOCKED.addSubnet(prefix, bits, "ipv6");

export function isPublicAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPublicAddress(mapped[1]);
  const family = net.isIP(ip);
  if (family === 4) return !BLOCKED.check(ip, "ipv4");
  if (family === 6) return !BLOCKED.check(ip, "ipv6") && !ip.toLowerCase().startsWith("::ffff:");
  return false;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

/** dns.lookup qui refuse tout nom resolvant (meme en partie) vers une adresse non publique. */
export function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (addresses.length === 0 || addresses.some(a => !isPublicAddress(a.address))) {
      const blocked: NodeJS.ErrnoException = new Error(`adresse non publique pour ${hostname}`);
      blocked.code = "EBLOCKEDADDRESS";
      return callback(blocked);
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

// ---------------------------------------------------------------------------
// La requete
// ---------------------------------------------------------------------------

/**
 * Pile de test (tools/test-stack) : faux hebergeur de liens courts sur la
 * boucle locale, comme DEEZER_API_BASE pour le faux Deezer. Ignoree si elle ne
 * vise pas 127.0.0.1, ::1 ou localhost : elle ne peut pas servir de relais.
 * En production, ignoree aussi, sauf sous le garde-fou de la pile
 * (tools/test-stack/no-egress.cjs, precharge par stack.sh, qui pose la marque
 * blindz.noEgress) : la pile tourne en NODE_ENV=production pour ressembler a la
 * prod, mais une variable egaree dans le .env de prod resterait sans effet.
 */
export function shortLinkTestBase(): URL | null {
  const raw = process.env.SHORT_LINK_TEST_BASE;
  if (!raw) return null;
  const underStackGuard = (globalThis as Record<symbol, unknown>)[Symbol.for("blindz.noEgress")] === true;
  if (process.env.NODE_ENV === "production" && !underStackGuard) return null;
  const base = parseUrl(raw);
  if (!base || (base.protocol !== "http:" && base.protocol !== "https:")) return null;
  return ["127.0.0.1", "[::1]", "localhost"].includes(base.hostname) ? base : null;
}

/**
 * L'adresse reellement appelee, rebatie sur une origine CONSTANTE : chaque
 * hote de depart a sa branche, avec l'origine ecrite en dur (« https://hote/ »).
 * Le chemin et la requete viennent du lien, l'hote jamais. Ainsi l'analyse
 * statique (CodeQL, js/request-forgery) voit un prefixe fixe, et une erreur
 * future dans les controles plus haut ne pourrait pas changer d'hote.
 * A garder alignee sur SHORT_LINK_HOSTS (le test « outboundUrl » le verifie).
 */
export function outboundUrl(url: URL): string | null {
  // pathname commence toujours par « / » pour une adresse https.
  const rest = `${url.pathname.slice(1)}${url.search}`;
  switch (url.hostname) {
    case "link.deezer.com":
      return `https://link.deezer.com/${rest}`;
    case "spotify.link":
      return `https://spotify.link/${rest}`;
    case "spotify.app.link":
      return `https://spotify.app.link/${rest}`;
    default:
      return null;
  }
}

const httpsHop: Hop = (url, timeoutMs) => {
  const outbound = outboundUrl(url);
  if (!outbound) return Promise.reject(new Error("hote hors liste"));
  const safe = new URL(outbound);
  const testBase = shortLinkTestBase();
  if (testBase) {
    const target = new URL(testBase.toString());
    target.pathname = `${testBase.pathname.replace(/\/+$/, "")}/${safe.hostname}${safe.pathname}`;
    target.search = safe.search;
    return request(target, timeoutMs, {});
  }
  return request(safe, timeoutMs, { lookup: safeLookup as unknown as net.LookupFunction });
};

function request(url: URL, timeoutMs: number, extra: { lookup?: net.LookupFunction }): Promise<HopResult> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      { method: "GET", agent: false, headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, ...extra },
      res => {
        const location = res.headers.location ?? null;
        resolve({ status: res.statusCode ?? 0, location });
        // Le corps ne nous sert a rien : on coupe sans le telecharger.
        res.destroy();
        req.destroy();
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("timeout")), timeoutMs);
    req.on("error", reject);
    req.on("close", () => clearTimeout(timer));
    req.end();
  });
}
