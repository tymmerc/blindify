// Campagne de tests de Blindz sur la pile isolee.
//
//   heavy node tools/test-stack/campaign.mjs [--seed N] [--no-browser] [--alert]
//
// 1. salles de bots en parallele (scenarios.mjs), jugees contre la base de test
// 2. un seul navigateur, qui passe d'un ecran a l'autre (browser.mjs) : lobbys,
//    partie reelle cote ecran central, et sonde audio
// 3. rapport JSON + page HTML, alerte e-mail si quelque chose casse
//
// La pile (stack.sh up) doit tourner. Rien ne sort sur Internet : le rapport
// compte les tentatives de sortie du backend de test, et une seule suffit a
// faire echouer la campagne.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { runRoom } from "./room.mjs"
import { retries } from "./bot.mjs"
import { botScenarios } from "./scenarios.mjs"
import { writeReport } from "./report.mjs"

const ROOT = "/opt/blindify"
const RUN = `${ROOT}/.test-stack`
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const seed = Number(arg("--seed", String(Math.floor(Date.now() / 86_400_000) % 10_000)))
const withBrowser = !process.argv.includes("--no-browser")
const alert = process.argv.includes("--alert")
const say = m => console.log(m)

const health = await fetch("http://127.0.0.1:3098/api/health").then(r => r.ok).catch(() => false)
if (!health) { console.error("pile de test arretee : lancer tools/test-stack/stack.sh up"); process.exit(2) }
const egressBefore = fs.readFileSync(`${RUN}/logs/egress.log`, "utf8").split("\n").filter(Boolean).length

const t0 = Date.now()
say(`campagne graine ${seed}`)

// --- 1. bots ---
const scenarios = botScenarios(seed)
say(`\n== ${scenarios.length} salles de bots en parallele ==`)
const rooms = await Promise.all(scenarios.map(async s => {
  const r = await runRoom(s)
  say(`  ${r.ok ? "[ok]" : "[KO]"} ${r.label} (${r.code ?? "?"}, ${r.stats.duree_s ?? "?"} s)`)
  for (const p of r.problems) say(`       - ${p}`)
  return r
}))

// --- 2. navigateur ---
let browser = { skipped: true, checks: [] }
if (withBrowser) {
  say("\n== navigateur ==")
  const { runBrowser } = await import("./browser.mjs")
  browser = await runBrowser({ seed, out: `${RUN}/reports/current` }).catch(e => ({ checks: [{ label: "navigateur", ok: false, problems: [`arret : ${e.message}`] }] }))
  for (const c of browser.checks) {
    say(`  ${c.ok ? "[ok]" : "[KO]"} ${c.label}`)
    for (const p of c.problems ?? []) say(`       - ${p}`)
  }
}

// --- 2 bis. scripts E2E historiques, portes sur la pile ---
// Un a la fois, apres le navigateur : chacun ouvre son propre Chromium.
const SCRIPTS = [{ label: "Correctifs PC (import par l'interface, code colle, platine, depart, buzzer sans musique)", args: ["pcfixes-e2e.mjs", "--pile"] }]
if (withBrowser) {
  say("\n== scripts E2E sur la pile ==")
  for (const sc of SCRIPTS) {
    const t = Date.now()
    const r = spawnSync(process.execPath, sc.args, { cwd: `${ROOT}/tools`, encoding: "utf8", timeout: 8 * 60 * 1000, env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` } })
    const lines = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter(l => /\[ok\]|!!|PROBLEME/.test(l))
    const check = { label: sc.label, ok: r.status === 0, problems: r.status === 0 ? [] : lines.filter(l => /!!/.test(l)).map(l => l.replace(/^\s*!!\s*/, "")).concat(r.error ? [String(r.error.message)] : []), notes: [`${lines.filter(l => /\[ok\]/.test(l)).length} verifications vertes en ${Math.round((Date.now() - t) / 1000)} s`], shots: [] }
    if (!check.ok && !check.problems.length) check.problems.push(`code de sortie ${r.status}`)
    browser.checks.push(check)
    say(`  ${check.ok ? "[ok]" : "[KO]"} ${sc.label}`)
    for (const p of check.problems) say(`       - ${p}`)
  }
}

// --- 3. rapport ---
const egress = fs.readFileSync(`${RUN}/logs/egress.log`, "utf8").split("\n").filter(Boolean).slice(egressBefore)
const result = {
  date: new Date().toISOString(),
  commit: fs.existsSync(`${RUN}/front.commit`) ? fs.readFileSync(`${RUN}/front.commit`, "utf8").trim() : null,
  seed,
  duree_s: Math.round((Date.now() - t0) / 1000),
  egress,
  reprises_reseau: retries,
  rooms,
  browser,
}
result.ok = egress.length === 0 && rooms.every(r => r.ok) && (browser.skipped || browser.checks.every(c => c.ok))
result.partial = Boolean(browser.skipped)
// Ce qui n'est pas commite n'est PAS teste (la pile tourne sur le commit) : on le dit.
result.non_commite = spawnSync("git", ["-C", ROOT, "status", "--porcelain"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean).length
result.backend_commit = fs.existsSync(`${RUN}/run/backend.commit`) ? fs.readFileSync(`${RUN}/run/backend.commit`, "utf8").trim() : null
const where = writeReport(result)
say(`\n${result.ok ? "CAMPAGNE VERTE" : "CAMPAGNE ROUGE"} en ${result.duree_s} s · rapport : ${where.url}`)
if (egress.length) say(`  !! ${egress.length} tentative(s) de sortie sur Internet refusee(s) : ${egress[0]}`)
if (alert && !result.ok) {
  const { sendAlert } = await import("./report.mjs")
  await sendAlert(result, where.url)
}
process.exit(result.ok ? 0 : 1)
