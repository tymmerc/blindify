// Origines autorisees a parler a l'API et au socket (CORS, filtre CSRF,
// handshake socket.io, CSP).
//
// Avant le 01/10/2026 la liste etait ecrite en dur et la meme partout :
// blindz.app, tymmerc.eu, dev.tymmerc.eu et localhost. Avec des cookies
// SameSite=None, n'importe quelle page de ces hotes, qui servent aussi
// d'autres applis, pouvait piloter le compte d'un joueur sur la prod. Desormais chaque
// deploiement n'accepte que son propre front, lu dans FRONTEND_URL.

import { DISCORD_CLIENT_ID_PATTERN, discordActivityOrigin } from "../config/discord";

export const LOCAL_DEV_ORIGINS: readonly string[] = ["http://localhost:3000", "http://localhost:5173"];

export type AllowedOriginsConfig = {
  // FRONTEND_URL : https://blindz.app en prod, https://dev.tymmerc.eu en dev.
  frontendUrl: string;
  // ALLOWED_ORIGINS : cas exceptionnel, liste separee par des virgules.
  extra?: string;
  // DISCORD_CLIENT_ID : l'Activite Discord est servie par le proxy de Discord
  // sous https://<id>.discordsays.com, l'origine que le navigateur presente a
  // l'API et au socket. Seul un identifiant Discord (chiffres) ouvre cette
  // origine ; toute autre valeur est ecartee et signalee.
  discordClientId?: string;
  isProd: boolean;
};

export type AllowedOrigins = {
  origins: string[];
  // Entrees illisibles, ecartees : a journaliser au demarrage.
  ignored: string[];
};

// Deux formes par URL : l'origine nue, car l'en-tete Origin n'a jamais de
// chemin, et l'URL complete sans "/" final, pour le Referer. null si l'entree
// n'est pas une URL http(s) : "*" ou "null" ne doivent jamais ouvrir la porte.
function originForms(raw: string): string[] | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const full = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  return full === url.origin ? [url.origin] : [url.origin, full];
}

export function buildAllowedOrigins(config: AllowedOriginsConfig): AllowedOrigins {
  const entries = [
    config.frontendUrl,
    ...(config.extra ?? "").split(","),
  ].map(e => e.trim()).filter(Boolean);

  const forms = entries.map(entry => ({ entry, forms: originForms(entry) }));
  const origins = forms.flatMap(f => f.forms ?? []);
  const ignored = forms.filter(f => f.forms === null).map(f => f.entry);
  const discord = discordOrigins(config.discordClientId);
  const local = config.isProd ? [] : LOCAL_DEV_ORIGINS;

  return { origins: [...new Set([...origins, ...discord.origins, ...local])], ignored: [...ignored, ...discord.ignored] };
}

function discordOrigins(clientId: string | undefined): AllowedOrigins {
  const id = (clientId ?? "").trim();
  if (!id) return { origins: [], ignored: [] };
  // Jamais la valeur dans le journal : un identifiant et un secret intervertis
  // dans le .env enverraient le secret dans les logs.
  if (!DISCORD_CLIENT_ID_PATTERN.test(id)) return { origins: [], ignored: ["DISCORD_CLIENT_ID (format invalide)"] };
  return { origins: [discordActivityOrigin(id)], ignored: [] };
}

// Filtre CSRF : egalite exacte, ou prefixe borne par un "/".
// Un simple startsWith laissait passer https://blindz.app.evil.com.
export function matchesAllowedOrigin(value: string, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.some(o => value === o || value.startsWith(o.endsWith("/") ? o : `${o}/`));
}

// Handshake socket.io. Un navigateur envoie toujours Origin sur un WebSocket et
// sur une requete cross-origin. Sans Origin, c'est un client Node (scripts E2E,
// bots de la pile de test) ou un polling same-origin : on accepte. "*" n'existe
// que pour le harnais de test d'integration, buildAllowedOrigins ne le produit
// jamais.
export function isSocketOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!origin) return true;
  return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
}
