// T30 : contre-epreuve du theme pose dans le <head> (apercu de la branche).
import { chromium } from "@playwright/test"
const B = process.argv[2] || "https://dev.tymmerc.eu/blindify-t30"
const b = await chromium.launch()
const cas = [
  ["appareil clair, sans parametre", "light", "/jouer/", "light"],
  ["appareil sombre, sans parametre", "dark", "/jouer/", "dark"],
  ["appareil sombre, Discord light", "dark", "/jouer/?theme=light&frame_id=f", "light"],
  ["appareil clair, Discord darker", "light", "/jouer/?theme=darker&frame_id=f", "dark"],
]
let ko = 0
for (const [nom, scheme, path, attendu] of cas) {
  const c = await b.newContext({ colorScheme: scheme })
  const p = await c.newPage()
  // Theme lu au tout premier evenement DOM : avant tout rendu de React.
  await p.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { window.__t30 = document.documentElement.getAttribute("data-theme") }))
  await p.goto(B + path, { waitUntil: "load" })
  const t = await p.evaluate(() => window.__t30)
  console.log(`${t === attendu ? "[ok]" : "!!"} ${nom} : ${t}`)
  if (t !== attendu) ko++
  await c.close()
}
await b.close()
process.exit(ko ? 1 : 0)
