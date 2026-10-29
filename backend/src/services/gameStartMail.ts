/**
 * Mail a Tym quand une vraie partie a plusieurs demarre (T18). Envoi par
 * Resend, avec la meme configuration que la sonde de prod
 * (tools/sonde-prod/mail.mjs), lue dans l'environnement du backend :
 *
 *   ALERTE_DESTINATAIRE  l'adresse qui recoit le mail ;
 *   ALERTE_EXPEDITEUR    « Nom <adresse> », d'un domaine verifie chez Resend ;
 *   RESEND_CLE_FICHIER   chemin absolu du fichier qui porte la ligne
 *                        RESEND_API_KEY= (premiere ligne, guillemets et \r retires).
 *
 * La sonde lit aussi /opt/blindify/.test-stack/alerte.env ; le backend non (le
 * conteneur ne le voit pas) : tout passe par l'environnement. La cle et les
 * adresses ne sont jamais affichees ni journalisees. Un seul essai par mail :
 * un echec est journalise, sans nouvel essai.
 */
import fs from "fs";

export const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+$/;
const NAMED_ADDRESS = /^[^<>\r\n]{1,60} <[^\s@<>]+@[^\s@<>]+>$/;
const PARIS = "Europe/Paris";

export type NotifConfig = { to: string | null; from: string | null; key: string | null; missing: string[] };
export type NotifMail = { subject: string; text: string };
export type SendResult = { sent: boolean; detail: string };
type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

/** Valeur d'une ligne NOM=valeur d'un fichier .env (guillemets et \r retires). */
export function readEnvValue(text: string, name: string): string | null {
  const line = String(text ?? "").split("\n").find(l => l.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).replace(/["\r]/g, "").trim();
  return value || null;
}

function readOptional(readFile: (file: string, enc: "utf8") => string, file: string): string {
  try {
    return readFile(file, "utf8");
  } catch {
    return "";
  }
}

/** Destinataire, expediteur et cle, plus ce qui manque (sans jamais les valeurs). */
export function loadNotifConfig({
  env = process.env,
  readFile = (file: string, enc: "utf8") => fs.readFileSync(file, enc),
}: { env?: Env; readFile?: (file: string, enc: "utf8") => string } = {}): NotifConfig {
  const to = env.ALERTE_DESTINATAIRE?.trim() || null;
  const from = env.ALERTE_EXPEDITEUR?.trim() || null;
  const keyFile = env.RESEND_CLE_FICHIER?.trim() || null;
  const key = keyFile?.startsWith("/") ? readEnvValue(readOptional(readFile, keyFile), "RESEND_API_KEY") : null;
  const missing = [
    to && ADDRESS.test(to) ? null : "destinataire absent ou invalide (ALERTE_DESTINATAIRE)",
    from && (ADDRESS.test(from) || NAMED_ADDRESS.test(from)) ? null : "expéditeur absent ou invalide (ALERTE_EXPEDITEUR)",
    key ? null : "clé Resend introuvable (ligne RESEND_API_KEY du fichier RESEND_CLE_FICHIER)",
  ].filter((m): m is string => m !== null);
  return { to, from, key, missing };
}

function underStackGuard(): boolean {
  return (globalThis as Record<symbol, unknown>)[Symbol.for("blindz.noEgress")] === true;
}

/**
 * Faux Resend de la pile de test (NOTIF_PARTIE_TEST_BASE) : suivi seulement
 * sous le garde-fou no-egress de la pile, et seulement en boucle locale. Une
 * variable egaree dans le .env de prod reste sans effet.
 */
export function resendTestBase(env: Env = process.env, guarded: boolean = underStackGuard()): string | null {
  const raw = env.NOTIF_PARTIE_TEST_BASE?.trim();
  if (!raw || !guarded) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:") return null;
    return ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeJson(text: string): { name?: unknown; message?: unknown } | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Ce que Resend dit de son refus, sur une ligne, sans adresse ni cle. */
export function resendError(body: { name?: unknown; message?: unknown } | null, key: string | null): string {
  const name = typeof body?.name === "string" && /^[a-z_]{1,40}$/.test(body.name) ? body.name : null;
  const raw = typeof body?.message === "string" ? body.message : "";
  const message = (key ? raw.split(key).join("<clé>") : raw)
    .replace(/re_[A-Za-z0-9_]{8,}/g, "<clé>")
    .replace(/[^\s@<>()"'`]+@[^\s@<>()"'`]+/g, "<adresse>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return [name, message ? `« ${message} »` : null].filter(Boolean).join(" ");
}

/** Un envoi, un seul essai. Ne leve jamais. */
export async function sendNotifMail({
  fetchFn = fetch as unknown as FetchLike,
  config,
  mail,
  url = resendTestBase() ?? RESEND_URL,
}: { fetchFn?: FetchLike; config: NotifConfig; mail: NotifMail; url?: string }): Promise<SendResult> {
  if (config.missing.length || !config.key || !config.to || !config.from) {
    return { sent: false, detail: config.missing.join(", ") || "config incomplete" };
  }
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [config.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.ok) return { sent: true, detail: "envoye" };
    const text = await res.text().catch(() => "");
    const why = resendError(safeJson(text), config.key);
    return { sent: false, detail: `Resend HTTP ${res.status}${why ? ` ${why}` : ""}` };
  } catch (err) {
    const name = err instanceof Error ? err.name : "erreur";
    return { sent: false, detail: `Resend injoignable (${name})` };
  }
}

// ---------------------------------------------------------------------------
// Contenu
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<string, string> = { friends: "À distance", event: "Autour d'une table" };
const PROVIDER_LABELS: Record<string, string> = { spotify: "Spotify", deezer: "Deezer" };

export function modeLabel(mode: string, discord: boolean): string {
  if (discord) return "Discord";
  return MODE_LABELS[mode] ?? mode;
}

/** Pseudo lisible et court : caracteres de controle retires, 32 caracteres au plus. */
function cleanName(name: string | null | undefined): string {
  const cleaned = String(name ?? "")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
  return cleaned || "Joueur";
}

function providersLabel(providers: ReadonlyArray<string | null | undefined>): string {
  const labels = [...new Set(providers.map(p => PROVIDER_LABELS[String(p ?? "").toLowerCase()]).filter(Boolean))].sort().reverse();
  return labels.length ? labels.join(" et ") : "inconnue";
}

export function parisTime(ms: number): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

export function parisDay(ms: number): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, day: "2-digit", month: "2-digit" }).format(new Date(ms));
}

export type StartMailInput = {
  mode: string;
  discord: boolean;
  players: ReadonlyArray<{ id: number; username: string | null | undefined }>;
  providers: ReadonlyArray<string | null | undefined>;
  startedAt: number;
  /** Lien spectateur signe, ou null si SPECTATEUR_SECRET manque. */
  link: string | null;
};

/** Le mail : mode, joueurs (pseudos seulement), heure, musique, lien. Rien d'autre. */
export function buildStartMail({ mode, discord, players, providers, startedAt, link }: StartMailInput): NotifMail {
  const label = modeLabel(mode, discord);
  const names = players.map(p => cleanName(p.username));
  const watch = link
    ? ["Regarder en direct (lien valable 3 h, les joueurs voient « 👀 1 spectateur ») :", link]
    : ["Lien spectateur indisponible : SPECTATEUR_SECRET n'est pas posé sur le backend."];
  return {
    subject: `Blindz : une partie à ${names.length} vient de démarrer (${label})`,
    text: [
      "Une partie vient de démarrer sur Blindz.",
      "",
      `Mode : ${label}`,
      `Joueurs (${names.length}) : ${names.join(", ")}`,
      `Heure : ${parisTime(startedAt)} (heure de Paris)`,
      `Musique : ${providersLabel(providers)}`,
      "",
      ...watch,
      "",
      "Un mail par salle, 6 au plus par jour. Sans tes parties ni celles des tests.",
    ].join("\n"),
  };
}

/** Au-dela du plafond du jour : un seul mail, le soir, avec le compte. */
export function buildOverflowMail({ count, dayLabel }: { count: number; dayLabel: string }): NotifMail {
  const what = count > 1 ? `${count} autres salles` : "1 autre salle";
  return {
    subject: `Blindz : et ${what} aujourd'hui (${dayLabel})`,
    text: [
      `Après le plafond de mails du jour, ${what} ${count > 1 ? "ont" : "a"} lancé une partie à plusieurs le ${dayLabel}.`,
      "",
      "Le détail est dans le tableau de bord des stats.",
    ].join("\n"),
  };
}
