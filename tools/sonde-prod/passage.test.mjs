// node --test tools/sonde-prod/*.test.mjs
// Des passages complets de la sonde, enchaines comme par le minuteur : faux
// blindz.app, faux Deezer, faux Resend, etat et journal dans un dossier jetable.
import { test, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { runOnce } from "./passage.mjs"
import { DEEZER, SPOTIFY, json, quickPlayOk, quickPlayKo, fakeFetch, prodRoutes, noSleep } from "./fakes.mjs"

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sonde-passage-"))
after(() => fs.rmSync(ROOT, { recursive: true, force: true }))
const config = () => ({ to: "tym@example.com", key: "re_cle_de_test", missing: [] })
const silent = () => {}

function files() {
  const dir = fs.mkdtempSync(path.join(ROOT, "cas-"))
  return { statePath: path.join(dir, "etat.json"), logPath: path.join(dir, "sonde.log") }
}

const prodUp = () => prodRoutes()
const prodDown = resend => prodRoutes({
  quickPlay: body => (body.url === DEEZER.url ? quickPlayKo("insufficient_tracks", 400, { needed: 10, found: 1 }) : quickPlayOk(9, "spotify")),
  deezerSearch: () => json({ data: [] }),
  ...(resend ? { resend } : {}),
})

async function pass(routes, where, extra = {}) {
  const { fn, calls } = fakeFetch(routes)
  const printed = []
  const result = await runOnce({ targets: [DEEZER, SPOTIFY], ...where, fetchFn: fn, sleep: noSleep, loadConfig: config, print: l => printed.push(l), warn: silent, ...extra })
  const mails = calls.filter(c => c.url === "https://api.resend.com/emails").map(c => JSON.parse(c.init.body))
  return { ...result, mails, printed }
}

const readState = file => JSON.parse(fs.readFileSync(file, "utf8"))
const readLog = file => fs.readFileSync(file, "utf8").trim().split("\n")

test("vert, panne, panne, vert : un e-mail de panne puis un de retour, une ligne de journal par passage", async () => {
  const where = files()
  const first = await pass(prodUp(), where)
  assert.deepEqual([first.ok, first.mail, first.mails.length], [true, "aucun", 0])

  const down = await pass(prodDown(), where)
  assert.deepEqual([down.ok, down.mail], [false, "panne:envoye"])
  assert.equal(down.mails.length, 1)
  assert.equal(down.mails[0].subject, "[Blindz] Le solo par lien ne marche plus sur blindz.app")
  assert.deepEqual(down.mails[0].to, ["tym@example.com"])
  assert.match(down.mails[0].text, /Ça ressemble à Deezer : en direct depuis le VPS, la recherche Deezer ne renvoie plus aucun résultat/)
  assert.equal(readState(where.statePath).announced, "KO")

  const still = await pass(prodDown(), where)
  assert.deepEqual([still.mail, still.mails.length], ["aucun", 0])

  const back = await pass(prodUp(), where)
  assert.equal(back.mail, "retour:envoye")
  assert.equal(back.mails[0].subject, "[Blindz] C'est reparti : le solo par lien remarche")
  assert.equal(readState(where.statePath).announced, "OK")

  const lines = readLog(where.logPath)
  assert.equal(lines.length, 4)
  assert.match(lines[1], /etat=KO annonce=KO .*deezer=KO\[insufficient_tracks;HTTP 400;1 titres;suspect=deezer\] spotify=ok\[9 titres;.*cause=deezer deezer_direct=empty mail=panne:envoye/)
  assert.ok(lines.every(l => !l.includes("@") && !l.includes("re_cle_de_test")), "ni adresse ni cle dans le journal")
})

test("Resend en panne : l'e-mail de panne est retente au passage suivant", async () => {
  const where = files()
  const failed = await pass(prodDown(() => json({ message: "erreur" }, 500)), where)
  assert.deepEqual([failed.mail, failed.mailFailed], ["panne:echec(Resend HTTP 500)", true])
  assert.equal(readState(where.statePath).announced, "OK", "Tym n'a rien recu")
  const retried = await pass(prodDown(), where)
  assert.deepEqual([retried.mail, retried.mailFailed], ["panne:envoye", false])
  const quiet = await pass(prodDown(), where)
  assert.deepEqual([quiet.mail, quiet.mailFailed], ["aucun", false], "pas d'e-mail du, pas d'echec")
})

test("cle ou destinataire absent : la sonde s'arrete avant tout appel, sauf en essai", async () => {
  const missing = () => ({ to: null, key: null, missing: ["destinataire absent ou invalide (alerte.env)"] })
  const { fn, calls } = fakeFetch(prodUp())
  await assert.rejects(
    runOnce({ targets: [DEEZER], ...files(), fetchFn: fn, sleep: noSleep, loadConfig: missing, print: silent, warn: silent }),
    /envoi d'e-mail impossible : destinataire absent/,
  )
  assert.equal(calls.length, 0, "pas de sonde si personne ne peut etre prevenu")
  const dry = await pass(prodDown(), { statePath: null, logPath: null }, { dryRun: true, loadConfig: missing })
  assert.equal(dry.mail, "panne:essai")
  assert.match(dry.printed.join("\n"), /ALERTE_DESTINATAIRE ABSENT/)
})

test("mode essai sans fichier : l'e-mail est affiche, rien n'est envoye ni ecrit", async () => {
  const dry = await pass(prodDown(), { statePath: null, logPath: null }, { dryRun: true })
  assert.deepEqual([dry.ok, dry.mail, dry.mails.length], [false, "panne:essai", 0])
  const shown = dry.printed.join("\n")
  assert.match(shown, /e-mail \(essai : non envoyé\)/)
  assert.match(shown, /Objet : \[Blindz\] Le solo par lien ne marche plus sur blindz\.app/)
  assert.ok(!shown.includes("tym@example.com") && !shown.includes("re_cle_de_test"))
  assert.ok(dry.printed.includes(dry.line), "la ligne du journal est affichee au lieu d'etre ecrite")
})

test("etat casse sur le disque : avertissement, on repart de zero, et ca continue", async () => {
  const where = files()
  fs.writeFileSync(where.statePath, "{casse")
  const warnings = []
  const r = await pass(prodDown(), where, { warn: w => warnings.push(w) })
  assert.match(warnings[0], /illisible/)
  assert.equal(r.mail, "panne:envoye")
})
