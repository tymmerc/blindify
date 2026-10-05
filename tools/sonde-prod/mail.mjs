// Envoi de l'alerte par Resend (meme compte que la surveillance blindz-uptime
// et la campagne de nuit). Rien de propre au VPS n'est ecrit dans le depot
// (public) : chaque reglage vient de la variable d'environnement du meme nom,
// sinon de sa ligne NOM=valeur dans /opt/blindify/.test-stack/alerte.env (hors
// du depot, ignore par git, lisible par root seul) :
//   ALERTE_DESTINATAIRE  l'adresse qui recoit l'alerte ;
//   ALERTE_EXPEDITEUR    l'expediteur, « Nom <adresse> », d'un domaine verifie chez Resend ;
//   RESEND_CLE_FICHIER   chemin absolu du fichier .env qui porte la ligne
//                        RESEND_API_KEY=, celui que lit deja blindz-uptime, et lu
//                        comme lui (premiere ligne RESEND_API_KEY=, guillemets et \r retires).
// Sous systemd il n'y a aucune de ces variables : seul alerte.env compte.
// La cle et les adresses ne sont jamais affichees ni ecrites dans le journal.
import fs from "node:fs"

export const ALERTE_FILE = "/opt/blindify/.test-stack/alerte.env"
const RESEND_URL = "https://api.resend.com/emails"
export const MAIL_ATTEMPTS = 3 // un envoi, puis deux nouveaux essais dans le meme passage
export const MAIL_RETRY_PAUSE_MS = 10_000
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+$/
const NAMED_ADDRESS = /^[^<>\r\n]{1,60} <[^\s@<>]+@[^\s@<>]+>$/
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Valeur d'une ligne NOM=valeur d'un fichier .env (guillemets et \r retires). */
export function readEnvValue(text, name) {
  const line = String(text ?? "").split("\n").find(l => l.startsWith(`${name}=`))
  const value = line?.slice(name.length + 1).replace(/["\r]/g, "").trim()
  return value || null
}

function readOptional(readFile, file) {
  try {
    return readFile(file, "utf8")
  } catch {
    return ""
  }
}

/** Destinataire, expediteur et cle, plus ce qui manque (sans jamais les valeurs). */
export function loadMailConfig({ readFile = fs.readFileSync, env = process.env } = {}) {
  const alerte = readOptional(readFile, ALERTE_FILE)
  const setting = name => env[name]?.trim() || readEnvValue(alerte, name)
  const to = setting("ALERTE_DESTINATAIRE")
  const from = setting("ALERTE_EXPEDITEUR")
  const keyFile = setting("RESEND_CLE_FICHIER")
  const key = keyFile?.startsWith("/") ? readEnvValue(readOptional(readFile, keyFile), "RESEND_API_KEY") : null
  const missing = [
    to && ADDRESS.test(to) ? null : "destinataire absent ou invalide (ALERTE_DESTINATAIRE)",
    from && (ADDRESS.test(from) || NAMED_ADDRESS.test(from)) ? null : "expéditeur absent ou invalide (ALERTE_EXPEDITEUR)",
    key ? null : "clé Resend introuvable (ligne RESEND_API_KEY du fichier RESEND_CLE_FICHIER)",
  ].filter(Boolean)
  return { to, from, key, missing }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Ce que Resend dit de son refus (champs name et message), sur une ligne,
 * sans adresse ni cle : son message peut citer une adresse (« You can only
 * send testing emails to ... »), et il finit dans le journal.
 */
export function resendError(body, key) {
  const name = typeof body?.name === "string" && /^[a-z_]{1,40}$/.test(body.name) ? body.name : null
  const raw = typeof body?.message === "string" ? body.message : ""
  const message = (key ? raw.split(key).join("<clé>") : raw)
    .replace(/re_[A-Za-z0-9_]{8,}/g, "<clé>")
    .replace(/[^\s@<>()"'`]+@[^\s@<>()"'`]+/g, "<adresse>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160)
  return [name, message ? `« ${message} »` : null].filter(Boolean).join(" ")
}

/** Un envoi. retry : vaut-il la peine de reessayer (reseau, 429, 5xx) ? */
async function sendOnce(fetchFn, config, mail) {
  try {
    const res = await fetchFn(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [config.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(20_000),
    })
    const text = await res.text().catch(() => "")
    if (res.ok) return { sent: true, detail: "envoye" }
    const why = resendError(safeJson(text), config.key)
    return { sent: false, retry: res.status === 429 || res.status >= 500, detail: `Resend HTTP ${res.status}${why ? ` ${why}` : ""}` }
  } catch (err) {
    return { sent: false, retry: true, detail: `Resend injoignable (${err?.name ?? "erreur"})` }
  }
}

/**
 * Envoie l'e-mail, avec deux nouveaux essais apres une courte pause si Resend
 * est injoignable ou en difficulte (un refus net, 401 ou 422, ne changera pas).
 * Renvoie { sent, detail } ; detail ne contient ni cle ni adresse.
 */
export async function sendMail({ fetchFn = fetch, config, mail, sleep = defaultSleep, pauseMs = MAIL_RETRY_PAUSE_MS, attempts = MAIL_ATTEMPTS }) {
  if (config.missing.length) return { sent: false, detail: config.missing.join(", ") }
  const attempt = async done => {
    const result = await sendOnce(fetchFn, config, mail)
    if (result.sent || !result.retry || done >= attempts) {
      return { sent: result.sent, detail: done > 1 && !result.sent ? `${result.detail}, ${done} essais` : result.detail }
    }
    await sleep(pauseMs)
    return attempt(done + 1)
  }
  return attempt(1)
}

/** L'e-mail tel qu'il partirait, pour le mode essai (--dry-run). Sans les adresses. */
export function previewMail(mail, config) {
  const setting = (value, name) => (value ? `${name} (présent)` : `${name} ABSENT`)
  return [
    "--- e-mail (essai : non envoyé) ---",
    `De : ${setting(config.from, "ALERTE_EXPEDITEUR")}`,
    `À : ${setting(config.to, "ALERTE_DESTINATAIRE")}`,
    `Clé Resend : ${config.key ? "présente" : "ABSENTE"}`,
    `Objet : ${mail.subject}`,
    "",
    mail.text,
    "--- fin de l'e-mail ---",
  ].join("\n")
}
