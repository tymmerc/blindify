// Envoi de l'alerte par Resend, avec les memes sources que la surveillance
// blindz-uptime (/opt/monitoring/blindz-uptime.sh) et la campagne de nuit
// (tools/test-stack/report.mjs) :
//   - cle : RESEND_API_KEY de /opt/corsairaventure/.env.local (meme compte Resend) ;
//   - destinataire : ALERTE_DESTINATAIRE de /opt/blindify/.test-stack/alerte.env,
//     hors du depot (public) ; la variable d'environnement du meme nom passe devant.
// La cle et l'adresse ne sont jamais affichees ni ecrites dans le journal.
import fs from "node:fs"

export const KEY_FILE = "/opt/corsairaventure/.env.local"
export const RECIPIENT_FILE = "/opt/blindify/.test-stack/alerte.env"
export const FROM = "Blindz Sonde <contact@corsairaventure.com>"
const RESEND_URL = "https://api.resend.com/emails"

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

/** Cle et destinataire, plus ce qui manque (sans jamais les valeurs). */
export function loadMailConfig({ readFile = fs.readFileSync, env = process.env } = {}) {
  const to = env.ALERTE_DESTINATAIRE?.trim() || readEnvValue(readOptional(readFile, RECIPIENT_FILE), "ALERTE_DESTINATAIRE")
  const key = readEnvValue(readOptional(readFile, KEY_FILE), "RESEND_API_KEY")
  const missing = [
    to && /^[^\s@]+@[^\s@]+$/.test(to) ? null : `destinataire absent ou invalide (${RECIPIENT_FILE})`,
    key ? null : `clé Resend introuvable (${KEY_FILE})`,
  ].filter(Boolean)
  return { to, key, missing }
}

/** Envoie l'e-mail. Renvoie { sent, detail } ; detail ne contient ni cle ni adresse. */
export async function sendMail({ fetchFn = fetch, config, mail }) {
  if (config.missing.length) return { sent: false, detail: config.missing.join(", ") }
  try {
    const res = await fetchFn(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [config.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(20_000),
    })
    await res.text().catch(() => "")
    return res.ok ? { sent: true, detail: "envoye" } : { sent: false, detail: `Resend HTTP ${res.status}` }
  } catch (err) {
    return { sent: false, detail: `Resend injoignable (${err?.name ?? "erreur"})` }
  }
}

/** L'e-mail tel qu'il partirait, pour le mode essai (--dry-run). Sans l'adresse. */
export function previewMail(mail, config) {
  const to = config.to ? "ALERTE_DESTINATAIRE de alerte.env (présent)" : "ALERTE_DESTINATAIRE ABSENT"
  const key = config.key ? "présente" : "ABSENTE"
  return `--- e-mail (essai : non envoyé) ---\nDe : ${FROM}\nÀ : ${to}\nClé Resend : ${key}\nObjet : ${mail.subject}\n\n${mail.text}\n--- fin de l'e-mail ---`
}
