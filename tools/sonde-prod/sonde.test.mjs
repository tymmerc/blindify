// node --test tools/sonde-prod/*.test.mjs
// La vraie ligne de commande, lancee dans un processus a part : son code de
// sortie est ce que lit systemd (SuccessExitStatus). Le reseau est simule par
// fakes-cli.mjs ; jamais de vraie requete, jamais de fichier d'etat ecrit.
import { test, after } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { EXIT } from "./passage.mjs"

const DIR = path.dirname(fileURLToPath(import.meta.url))
const SONDE = path.join(DIR, "sonde.mjs")
const PRELOAD = pathToFileURL(path.join(DIR, "fakes-cli.mjs")).href
const UNITS = path.join(DIR, "../../infra/sonde-prod")
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sonde-cli-"))
after(() => fs.rmSync(ROOT, { recursive: true, force: true }))

const KEY_FILE = path.join(ROOT, "cle.env")
fs.writeFileSync(KEY_FILE, "RESEND_API_KEY=re_cle_de_test\n")
const MAIL_ENV = { ALERTE_DESTINATAIRE: "tym@example.com", ALERTE_EXPEDITEUR: "Essai <sonde@example.com>", RESEND_CLE_FICHIER: KEY_FILE }

function cli(args, { scenario, env = {}, script = SONDE } = {}) {
  const preload = scenario ? ["--import", PRELOAD] : []
  const r = spawnSync(process.execPath, [...preload, script, ...args], {
    env: { ...process.env, ...MAIL_ENV, ...env, ...(scenario ? { SONDE_ESSAI_SCENARIO: scenario } : {}) },
    encoding: "utf8",
    timeout: 30_000,
  })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

const unitValues = (file, key) => fs.readFileSync(path.join(UNITS, file), "utf8").split("\n")
  .filter(l => l.startsWith(`${key}=`)).map(l => l.slice(key.length + 1).trim())

test("CLI : prod en forme, code 0", () => {
  const r = cli(["--dry-run"], { scenario: "vert" })
  assert.equal(r.code, EXIT.OK, r.err)
  assert.match(r.out, /etat=OK .* mail=aucun/)
})

test("CLI : prod en panne, code 10 et l'e-mail affiche (essai)", () => {
  const r = cli(["--dry-run"], { scenario: "panne" })
  assert.equal(r.code, EXIT.PANNE, r.err)
  assert.match(r.out, /Objet : \[Blindz\] Le solo par lien ne marche plus sur blindz\.app/)
  assert.match(r.out, /\[KO\] Deezer, playlist Top France : .* \(2 essais\)/)
  assert.match(r.out, /etat=KO .* mail=panne:essai/)
})

test("CLI : option fausse ou config incomplete, code 2", () => {
  const bad = cli(["--only", "rien"], { scenario: "vert" })
  assert.equal(bad.code, EXIT.SONDE)
  assert.match(bad.err, /--only : deezer ou spotify/)
  const ready = cli(["--verifier-config"])
  assert.equal(ready.code, EXIT.OK, ready.err)
  assert.match(ready.out, /config d'envoi complète/)
  const missing = cli(["--verifier-config"], { env: { ALERTE_EXPEDITEUR: "pas une adresse" } })
  assert.equal(missing.code, EXIT.SONDE)
  assert.match(missing.err, /expéditeur absent ou invalide \(ALERTE_EXPEDITEUR\)/)
  assert.ok(!`${ready.out}${missing.err}`.includes("tym@example.com"), "jamais l'adresse")
})

test("CLI : erreur fatale de Node (un module manque a la copie), code 1, que systemd ne prend pas pour une panne", () => {
  const alone = path.join(fs.mkdtempSync(path.join(ROOT, "seule-")), "sonde.mjs")
  fs.copyFileSync(SONDE, alone)
  const r = cli(["--dry-run"], { script: alone })
  assert.equal(r.code, 1)
  assert.match(r.err, /ERR_MODULE_NOT_FOUND/)
  assert.deepEqual(unitValues("blindz-sonde-prod.service", "SuccessExitStatus"), [String(EXIT.PANNE)], "seuls 0 et 10 sont des succes")
})

test("unites : la sonde en echec previent par ntfy, et l'installeur copie tout le code", () => {
  assert.deepEqual(unitValues("blindz-sonde-prod.service", "OnFailure"), ["blindz-sonde-prod-echec.service"])
  assert.deepEqual(unitValues("blindz-sonde-prod-echec.service", "ExecStart"), ["/bin/bash /opt/monitoring/sonde-prod/echec-ntfy.sh"])
  const installer = fs.readFileSync(path.join(DIR, "installer.sh"), "utf8")
  const listed = installer.match(/^CODE=\(([^)]*)\)/m)[1].split(/\s+/).filter(Boolean).sort()
  const modules = fs.readdirSync(DIR).filter(f => f.endsWith(".mjs") && !f.endsWith(".test.mjs") && !f.startsWith("fakes")).sort()
  assert.deepEqual(listed, modules, "un module oublie par l'installeur = code 1 en prod")
  assert.match(installer, /^SCRIPTS=\(echec-ntfy\.sh\)$/m)
  assert.match(installer, /^SERVICE=blindz-sonde-prod\.service$/m)
  assert.match(installer, /^TIMER=blindz-sonde-prod\.timer$/m)
  assert.match(installer, /^UNIT_FILES=\("\$SERVICE" blindz-sonde-prod-echec\.service "\$TIMER"\)$/m)
  assert.deepEqual(fs.readdirSync(UNITS).sort(), ["blindz-sonde-prod-echec.service", "blindz-sonde-prod.service", "blindz-sonde-prod.timer"])
})
