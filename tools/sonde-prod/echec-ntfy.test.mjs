// node --test tools/sonde-prod/*.test.mjs
// Le second canal (echec-ntfy.sh), lance avec un faux curl : aucune vraie
// notification ne part, on lit ce que le script lui aurait demande.
import { test, after } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "echec-ntfy.sh")
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sonde-ntfy-"))
after(() => fs.rmSync(ROOT, { recursive: true, force: true }))
const TOPIC = "sujet-essai_123"

/** Un faux curl qui note ses arguments (un par ligne) et repond le code HTTP donne. */
function fakeCurl(http) {
  const dir = fs.mkdtempSync(path.join(ROOT, "bin-"))
  const log = path.join(dir, "appels")
  fs.writeFileSync(path.join(dir, "curl"), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${log}"\nprintf '${http}'\n`, { mode: 0o700 })
  return { dir, args: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n") : null) }
}

function run({ topic, http = "200", env = {} } = {}) {
  const curl = fakeCurl(http)
  const topicFile = path.join(fs.mkdtempSync(path.join(ROOT, "sujet-")), ".ntfy-topic")
  if (topic !== undefined) fs.writeFileSync(topicFile, topic)
  const r = spawnSync("bash", [SCRIPT], {
    env: { PATH: `${curl.dir}:${process.env.PATH}`, NTFY_TOPIC_FILE: topicFile, ...env },
    encoding: "utf8",
  })
  return { code: r.status, out: `${r.stdout}${r.stderr}`, args: curl.args() }
}

test("sonde en echec : une notification ntfy, comme les autres alertes du VPS, sans afficher le sujet", () => {
  const r = run({ topic: `${TOPIC}\n`, env: { MONITOR_SERVICE_RESULT: "exit-code", MONITOR_EXIT_STATUS: "2" } })
  assert.equal(r.code, 0)
  assert.ok(r.args.includes(`https://ntfy.sh/${TOPIC}`))
  assert.ok(r.args.includes("Title: [Blindz] la sonde de prod est en echec"))
  assert.ok(r.args.includes("Priority: high"))
  const body = r.args[r.args.indexOf("-d") + 1]
  assert.match(body, /a échoué \(résultat exit-code, code 2\)/)
  assert.match(body, /journalctl -u blindz-sonde-prod/)
  assert.equal(r.out.trim(), "notification ntfy : HTTP 200")
  assert.ok(!r.out.includes(TOPIC), "le sujet n'est jamais affiche")
})

test("sujet ntfy absent, vide ou invalide : une ligne dans le journal, aucun appel", () => {
  for (const topic of [undefined, "", "  \n", "pas/un sujet", "x".repeat(65)]) {
    const r = run({ topic })
    assert.equal(r.code, 0, String(topic))
    assert.equal(r.args, null, `aucun curl pour ${JSON.stringify(topic)}`)
    assert.match(r.out, /aucune notification : (pas de sujet ntfy|sujet ntfy invalide)/)
  }
})

test("ntfy refuse : l'unite d'alerte echoue (visible dans son journal)", () => {
  const r = run({ topic: TOPIC, http: "500" })
  assert.equal(r.code, 1)
  assert.match(r.out, /HTTP 500/)
})

test("donnees de systemd nettoyees avant d'entrer dans le message", () => {
  const r = run({ topic: TOPIC, env: { MONITOR_SERVICE_RESULT: "exit-code\"; rm -rf /", MONITOR_EXIT_STATUS: "2$(id)" } })
  const body = r.args[r.args.indexOf("-d") + 1]
  assert.match(body, /résultat exit-coderm-rf, code 2id\)/)
})
