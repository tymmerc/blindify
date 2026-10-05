// node --test tools/sonde-prod/*.test.mjs
// Fichiers dans un dossier temporaire, jamais ceux du minuteur.
import { test, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadState, saveState, appendLog } from "./storage.mjs"
import { INITIAL_STATE } from "./decision.mjs"

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sonde-test-"))
const tmp = () => fs.mkdtempSync(path.join(ROOT, "cas-"))
after(() => fs.rmSync(ROOT, { recursive: true, force: true }))

test("etat absent : etat initial, sans avertissement", () => {
  assert.deepEqual(loadState(path.join(tmp(), "rien.json")), { state: INITIAL_STATE, warning: null })
})

test("etat ecrit puis relu, lisible par root seul", () => {
  const file = path.join(tmp(), "sous-dossier", "etat.json")
  const state = { ...INITIAL_STATE, announced: "KO", downSince: "2026-10-05T00:00:00.000Z", lastAlertAt: "2026-10-05T00:00:00.000Z", lastRunAt: "2026-10-05T00:00:00.000Z", lastResult: "KO" }
  saveState(file, state)
  assert.deepEqual(loadState(file), { state, warning: null })
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ["etat.json"], "pas de fichier temporaire oublie")
})

test("etat casse ou trafique : etat initial et un avertissement", () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, "casse.json"), "{pas du json")
  fs.writeFileSync(path.join(dir, "faux.json"), '{"announced":"PEUT-ETRE"}')
  assert.equal(loadState(path.join(dir, "casse.json")).state, INITIAL_STATE)
  assert.match(loadState(path.join(dir, "casse.json")).warning, /JSON casse/)
  assert.match(loadState(path.join(dir, "faux.json")).warning, /invalide/)
})

test("journal : une ligne par passage, ajoutee a la fin", () => {
  const file = path.join(tmp(), "log", "sonde.log")
  appendLog(file, "ligne 1")
  appendLog(file, "ligne 2")
  assert.equal(fs.readFileSync(file, "utf8"), "ligne 1\nligne 2\n")
})
