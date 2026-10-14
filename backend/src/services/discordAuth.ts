import { discordApiBase, type DiscordCredentials } from "../config/discord";

/**
 * Connexion d'un joueur depuis l'Activite Discord.
 *
 * Le SDK (dans l'iframe) obtient un code OAuth2 avec authorize(). Le front nous
 * l'envoie, et c'est ICI, cote serveur, que le code est echange contre un
 * jeton d'acces avec le secret de l'appli, puis que l'utilisateur Discord est
 * lu. Le front ne parle jamais a l'API Discord lui-meme : l'identite vient de
 * Discord, pas de ce que le client declare (le SDK peut etre imite).
 *
 * Le jeton d'acces repart au front, parce que le SDK en a besoin pour
 * authenticate(). Le jeton de rafraichissement est ignore : on ne rappelle
 * jamais Discord plus tard, il n'a rien a faire en base.
 */

export type DiscordUser = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

export type DiscordAuthErrorKind = "code_rejected" | "unavailable";

export class DiscordAuthError extends Error {
  constructor(
    readonly kind: DiscordAuthErrorKind,
    message: string,
    readonly status?: number,
    /** Le champ "error" de la reponse de Discord (invalid_grant, invalid_client...), jamais secret. */
    readonly discordError?: string,
  ) {
    super(message);
    this.name = "DiscordAuthError";
  }
}

type Deps = { fetchImpl?: typeof fetch; timeoutMs?: number };

const DEFAULT_TIMEOUT_MS = 10_000;
const DISCORD_ID_PATTERN = /^\d{15,22}$/;
// Empreinte d'avatar Discord : hexadecimal, parfois prefixe "a_" (anime).
const AVATAR_HASH_PATTERN = /^[a-z0-9_]{1,64}$/i;

// Code d'autorisation OAuth2 : lettres, chiffres et - . _ ~ (alphabet de la
// RFC 6749). Valide ici, avant toute requete chez Discord : un code forge ne
// doit pas voyager.
export const DISCORD_AUTH_CODE_PATTERN = /^[A-Za-z0-9._~-]{1,256}$/;

export function isValidAuthCode(value: unknown): value is string {
  return typeof value === "string" && DISCORD_AUTH_CODE_PATTERN.test(value);
}

async function callDiscord(path: string, init: RequestInit, deps: Deps): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetchImpl(`${discordApiBase()}${path}`, { ...init, signal: controller.signal });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DiscordAuthError("unavailable", `Discord injoignable : ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await res.json();
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function refused(res: Response, what: string): Promise<DiscordAuthError> {
  const data = await readJson(res);
  const discordError = typeof data.error === "string" ? data.error.slice(0, 40) : undefined;
  // invalid_client : le secret de l'appli est faux ou a ete regenere. Ce n'est
  // pas le joueur qui est refuse, c'est notre configuration qui est en panne.
  if (discordError === "invalid_client") {
    return new DiscordAuthError("unavailable", `Discord refuse l'appli elle-meme (${res.status})`, res.status, discordError);
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    return new DiscordAuthError("code_rejected", `Discord a refuse ${what} (${res.status})`, res.status, discordError);
  }
  return new DiscordAuthError("unavailable", `Discord a repondu ${res.status} pour ${what}`, res.status, discordError);
}

/** Echange le code du SDK contre un jeton d'acces. Flux d'une Activite : pas de redirect_uri. */
export async function exchangeCode(
  code: string,
  credentials: DiscordCredentials,
  deps: Deps = {},
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: "authorization_code",
    code,
  });
  const res = await callDiscord(
    "/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    },
    deps,
  );
  if (!res.ok) throw await refused(res, "le code de connexion");
  const data = await readJson(res);
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) throw new DiscordAuthError("unavailable", "Reponse de Discord sans jeton d'acces", res.status);
  const expiresIn = typeof data.expires_in === "number" && Number.isFinite(data.expires_in) ? data.expires_in : null;
  return { accessToken, expiresIn };
}

/** Lit l'utilisateur Discord avec son jeton (scope identify). */
export async function fetchDiscordUser(accessToken: string, deps: Deps = {}): Promise<DiscordUser> {
  const res = await callDiscord(
    "/users/@me",
    { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    deps,
  );
  if (!res.ok) throw await refused(res, "le jeton d'acces");
  const data = await readJson(res);
  const id = typeof data.id === "string" ? data.id : "";
  const username = typeof data.username === "string" ? data.username.trim() : "";
  if (!DISCORD_ID_PATTERN.test(id) || !username) {
    throw new DiscordAuthError("unavailable", "Reponse de Discord illisible (utilisateur)", res.status);
  }
  return {
    id,
    username,
    globalName: typeof data.global_name === "string" ? data.global_name : null,
    avatar: typeof data.avatar === "string" ? data.avatar : null,
  };
}

/** Adresse CDN de l'avatar, construite seulement a partir d'une empreinte propre. */
export function discordAvatarUrl(user: Pick<DiscordUser, "id" | "avatar">): string | null {
  if (!user.avatar || !AVATAR_HASH_PATTERN.test(user.avatar) || !DISCORD_ID_PATTERN.test(user.id)) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

/** Nom affiche dans Blindz : le nom d'affichage Discord, sinon le pseudo. users.username fait 120. */
export function discordDisplayName(user: DiscordUser): string {
  const display = user.globalName?.trim() || user.username.trim();
  return display.slice(0, 120);
}
