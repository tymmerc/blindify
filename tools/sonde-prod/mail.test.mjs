// node --test tools/sonde-prod/*.test.mjs
// Ni vraie cle ni vraie adresse : les fichiers sont simules.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readEnvValue, loadMailConfig, sendMail, previewMail, KEY_FILE, RECIPIENT_FILE, FROM } from "./mail.mjs"

const KEY = "re_cle_de_test"
const TO = "tym@example.com"
const files = map => file => {
  if (file in map) return map[file]
  throw Object.assign(new Error("absent"), { code: "ENOENT" })
}
const mail = { subject: "[Blindz] Le solo par lien ne marche plus sur blindz.app", text: "detail" }

test("lecture d'une valeur .env, guillemets et fin de ligne Windows retires", () => {
  const text = 'AUTRE=1\r\nRESEND_API_KEY="re_abc"\r\nRESEND_API_KEY_OLD=zzz\n'
  assert.equal(readEnvValue(text, "RESEND_API_KEY"), "re_abc")
  assert.equal(readEnvValue(text, "ABSENTE"), null)
  assert.equal(readEnvValue("VIDE=\n", "VIDE"), null)
  assert.equal(readEnvValue(undefined, "X"), null)
})

test("configuration : cle et destinataire lus dans leurs fichiers", () => {
  const config = loadMailConfig({ readFile: files({ [KEY_FILE]: `RESEND_API_KEY=${KEY}\n`, [RECIPIENT_FILE]: `ALERTE_DESTINATAIRE=${TO}\n` }), env: {} })
  assert.deepEqual(config, { to: TO, key: KEY, missing: [] })
})

test("configuration : la variable d'environnement passe devant le fichier", () => {
  const config = loadMailConfig({ readFile: files({ [KEY_FILE]: `RESEND_API_KEY=${KEY}`, [RECIPIENT_FILE]: "ALERTE_DESTINATAIRE=autre@example.com" }), env: { ALERTE_DESTINATAIRE: TO } })
  assert.equal(config.to, TO)
})

test("configuration incomplete : ce qui manque, sans planter", () => {
  const config = loadMailConfig({ readFile: files({}), env: {} })
  assert.equal(config.missing.length, 2)
  const bad = loadMailConfig({ readFile: files({ [KEY_FILE]: `RESEND_API_KEY=${KEY}`, [RECIPIENT_FILE]: "ALERTE_DESTINATAIRE=pas une adresse" }), env: {} })
  assert.match(bad.missing.join(), /destinataire absent ou invalide/)
})

test("envoi : la requete Resend attendue", async () => {
  const calls = []
  const fetchFn = async (url, init) => { calls.push({ url, init }); return new Response('{"id":"1"}', { status: 200 }) }
  const result = await sendMail({ fetchFn, config: { to: TO, key: KEY, missing: [] }, mail })
  assert.deepEqual(result, { sent: true, detail: "envoye" })
  assert.equal(calls[0].url, "https://api.resend.com/emails")
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`)
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: FROM, to: [TO], subject: mail.subject, text: mail.text })
})

test("envoi refuse ou injoignable : pas envoye, sans cle ni adresse dans le detail", async () => {
  const config = { to: TO, key: KEY, missing: [] }
  const refused = await sendMail({ fetchFn: async () => new Response("{}", { status: 422 }), config, mail })
  assert.deepEqual(refused, { sent: false, detail: "Resend HTTP 422" })
  const down = await sendMail({ fetchFn: async () => { throw new TypeError("fetch failed") }, config, mail })
  assert.equal(down.sent, false)
  for (const r of [refused, down]) assert.ok(!r.detail.includes(KEY) && !r.detail.includes(TO))
})

test("configuration incomplete : aucun appel a Resend", async () => {
  let called = false
  const result = await sendMail({ fetchFn: async () => { called = true }, config: { to: null, key: null, missing: ["x"] }, mail })
  assert.equal(result.sent, false)
  assert.equal(called, false)
})

test("mode essai : l'e-mail affiche, jamais la cle ni l'adresse", () => {
  const text = previewMail(mail, { to: TO, key: KEY, missing: [] })
  assert.match(text, /Objet : \[Blindz\] Le solo par lien ne marche plus/)
  assert.match(text, /Clé Resend : présente/)
  assert.ok(!text.includes(KEY) && !text.includes(TO))
  assert.match(previewMail(mail, { to: null, key: null, missing: [] }), /ABSENT/)
})
