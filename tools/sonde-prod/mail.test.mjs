// node --test tools/sonde-prod/*.test.mjs
// Ni vraie cle ni vraie adresse : les fichiers sont simules.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readEnvValue, loadMailConfig, sendMail, previewMail, resendError, ALERTE_FILE, MAIL_ATTEMPTS, MAIL_RETRY_PAUSE_MS } from "./mail.mjs"

const KEY = "re_cle_de_test_123"
const TO = "tym@example.com"
const FROM = "Blindz Sonde <sonde@example.com>"
const KEY_FILE = "/etc/essai/resend.env"
const ALERTE = `ALERTE_DESTINATAIRE=${TO}\nALERTE_EXPEDITEUR="${FROM}"\nRESEND_CLE_FICHIER=${KEY_FILE}\n`
const CONFIG = { to: TO, from: FROM, key: KEY, missing: [] }
const files = map => file => {
  if (file in map) return map[file]
  throw Object.assign(new Error("absent"), { code: "ENOENT" })
}
const mail = { subject: "[Blindz] Le solo par lien ne marche plus sur blindz.app", text: "detail" }

/** Faux Resend : une reponse (Response ou Error) par appel, dans l'ordre. */
function resend(...answers) {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url, init })
    const out = answers.length > 1 ? answers.shift() : answers[0]
    if (out instanceof Error) throw out
    return out.clone()
  }
  return { fetchFn, calls }
}
const ok = () => new Response('{"id":"1"}', { status: 200 })

test("lecture d'une valeur .env, comme blindz-uptime : premiere ligne, guillemets et fin de ligne Windows retires", () => {
  const text = 'AUTRE=1\r\nRESEND_API_KEY="re_abc"\r\nRESEND_API_KEY=re_seconde\nRESEND_API_KEY_OLD=zzz\n'
  assert.equal(readEnvValue(text, "RESEND_API_KEY"), "re_abc")
  assert.equal(readEnvValue(text, "ABSENTE"), null)
  assert.equal(readEnvValue("VIDE=\n", "VIDE"), null)
  assert.equal(readEnvValue(undefined, "X"), null)
})

test("configuration : destinataire, expediteur et fichier de la cle lus dans alerte.env", () => {
  const config = loadMailConfig({ readFile: files({ [ALERTE_FILE]: ALERTE, [KEY_FILE]: `RESEND_API_KEY=${KEY}\n` }), env: {} })
  assert.deepEqual(config, { to: TO, from: FROM, key: KEY, missing: [] })
})

test("configuration : les variables d'environnement passent devant alerte.env", () => {
  const readFile = files({ [ALERTE_FILE]: ALERTE, [KEY_FILE]: "RESEND_API_KEY=re_fichier_alerte", "/autre/cle.env": `RESEND_API_KEY=${KEY}` })
  const env = { ALERTE_DESTINATAIRE: "autre@example.com", ALERTE_EXPEDITEUR: "autre@example.com", RESEND_CLE_FICHIER: "/autre/cle.env" }
  assert.deepEqual(loadMailConfig({ readFile, env }), { to: "autre@example.com", from: "autre@example.com", key: KEY, missing: [] })
})

test("configuration incomplete : ce qui manque, nomme par sa variable, sans planter ni valeur", () => {
  const empty = loadMailConfig({ readFile: files({}), env: {} })
  assert.deepEqual(empty.missing, [
    "destinataire absent ou invalide (ALERTE_DESTINATAIRE)",
    "expéditeur absent ou invalide (ALERTE_EXPEDITEUR)",
    "clé Resend introuvable (ligne RESEND_API_KEY du fichier RESEND_CLE_FICHIER)",
  ])
  const bad = loadMailConfig({
    readFile: files({ [ALERTE_FILE]: "ALERTE_DESTINATAIRE=pas une adresse\nALERTE_EXPEDITEUR=Nom <pas-une-adresse>\nRESEND_CLE_FICHIER=relatif/cle.env", "relatif/cle.env": `RESEND_API_KEY=${KEY}` }),
    env: {},
  })
  assert.equal(bad.missing.length, 3, "adresse, expediteur et chemin relatif refuses")
  assert.ok(!bad.missing.join().includes(KEY))
  const noKey = loadMailConfig({ readFile: files({ [ALERTE_FILE]: ALERTE, [KEY_FILE]: "AUTRE=1" }), env: {} })
  assert.deepEqual(noKey.missing, ["clé Resend introuvable (ligne RESEND_API_KEY du fichier RESEND_CLE_FICHIER)"])
})

test("envoi : la requete Resend attendue, avec l'expediteur de la config", async () => {
  const { fetchFn, calls } = resend(ok())
  const result = await sendMail({ fetchFn, config: CONFIG, mail })
  assert.deepEqual(result, { sent: true, detail: "envoye" })
  assert.equal(calls[0].url, "https://api.resend.com/emails")
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`)
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: FROM, to: [TO], subject: mail.subject, text: mail.text })
})

test("envoi : Resend en difficulte, deux nouveaux essais apres une courte pause", async () => {
  const pauses = []
  const sleep = async ms => { pauses.push(ms) }
  const flaky = resend(new Response("{}", { status: 503 }), new TypeError("fetch failed"), ok())
  assert.deepEqual(await sendMail({ fetchFn: flaky.fetchFn, config: CONFIG, mail, sleep }), { sent: true, detail: "envoye" })
  assert.equal(flaky.calls.length, 3)
  assert.deepEqual(pauses, [MAIL_RETRY_PAUSE_MS, MAIL_RETRY_PAUSE_MS])
  const down = resend(new Response('{"name":"internal_server_error","message":"boom"}', { status: 500 }))
  const failed = await sendMail({ fetchFn: down.fetchFn, config: CONFIG, mail, sleep })
  assert.deepEqual(failed, { sent: false, detail: `Resend HTTP 500 internal_server_error « boom », ${MAIL_ATTEMPTS} essais` })
  assert.equal(down.calls.length, MAIL_ATTEMPTS)
  const limited = resend(new Response("{}", { status: 429 }), ok())
  assert.equal((await sendMail({ fetchFn: limited.fetchFn, config: CONFIG, mail, sleep })).sent, true, "429 : on reessaie")
})

test("envoi refuse net (cle ou adresse refusee) : pas de nouvel essai, la raison de Resend sans adresse ni cle", async () => {
  const body = { statusCode: 403, name: "validation_error", message: `You can only send testing emails to your own email address (${TO}). Key ${KEY}.` }
  const { fetchFn, calls } = resend(new Response(JSON.stringify(body), { status: 403 }))
  let paused = false
  const refused = await sendMail({ fetchFn, config: CONFIG, mail, sleep: async () => { paused = true } })
  assert.equal(calls.length, 1)
  assert.equal(paused, false)
  assert.match(refused.detail, /^Resend HTTP 403 validation_error « You can only send testing emails to your own email address \(<adresse>\)\. Key <clé>\. »$/)
  const down = await sendMail({ fetchFn: async () => { throw new TypeError("fetch failed") }, config: CONFIG, mail, sleep: async () => {} })
  assert.equal(down.detail, `Resend injoignable (TypeError), ${MAIL_ATTEMPTS} essais`)
  for (const r of [refused, down]) assert.ok(!r.detail.includes(KEY) && !r.detail.includes(TO))
})

test("raison de Resend : nom filtre, message sur une ligne et coupe", () => {
  assert.equal(resendError({ name: "Bad Name; x", message: "a\n\nb" }), "« a b »")
  assert.equal(resendError(null), "")
  assert.equal(resendError({ name: "rate_limit_exceeded" }), "rate_limit_exceeded")
  assert.ok(resendError({ message: "x".repeat(500) }).length < 170)
  assert.equal(resendError({ message: "cle re_AbCdEf123456 fuite" }), "« cle <clé> fuite »", "une cle Resend, meme une autre, est masquee")
})

test("configuration incomplete : aucun appel a Resend", async () => {
  let called = false
  const result = await sendMail({ fetchFn: async () => { called = true }, config: { to: null, from: null, key: null, missing: ["x"] }, mail })
  assert.equal(result.sent, false)
  assert.equal(called, false)
})

test("mode essai : l'e-mail affiche, jamais la cle ni les adresses", () => {
  const text = previewMail(mail, CONFIG)
  assert.match(text, /Objet : \[Blindz\] Le solo par lien ne marche plus/)
  assert.match(text, /De : ALERTE_EXPEDITEUR \(présent\)/)
  assert.match(text, /Clé Resend : présente/)
  assert.ok(!text.includes(KEY) && !text.includes(TO) && !text.includes("sonde@example.com"))
  assert.match(previewMail(mail, { to: null, from: null, key: null, missing: [] }), /ALERTE_EXPEDITEUR ABSENT/)
})

test("rien de propre au VPS dans le code de la sonde (depot public) : ni adresse, ni client, ni fichier de cle", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const code = fs.readdirSync(dir).filter(f => /\.(mjs|sh)$/.test(f) && !/\.test\.mjs$|^fakes/.test(f))
  assert.ok(code.includes("mail.mjs") && code.includes("installer.sh"))
  for (const file of code) {
    const text = fs.readFileSync(path.join(dir, file), "utf8")
    assert.doesNotMatch(text, /corsair/i, file)
    assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, file)
  }
})
