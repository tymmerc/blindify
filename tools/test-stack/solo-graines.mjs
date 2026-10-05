// Rejoue seulement les ecrans solo du navigateur (classique avec defi, puis
// chrono) pour des graines choisies, sans les salles de bots : de quoi verifier
// vite une graine qui a fait rougir le solo d'une campagne.
//
//   tools/test-stack/campagne-ref.sh <branche> --script /chemin/tools/test-stack/solo-graines.mjs [graine...] [--out DOSSIER]
//
// Par defaut 520 et 553 : les deux graines qui tiraient la playlist factice 0
// (520 pour le solo classique, 553 pour le chrono), voir browser-solo.mjs.
import fs from "node:fs"
import path from "node:path"
import { runBrowser } from "./browser.mjs"
import { playlistDe } from "./browser-solo.mjs"

const args = process.argv.slice(2)
const i = args.indexOf("--out")
const OUT = path.resolve(i >= 0 ? args[i + 1] : `/opt/blindify/.test-stack/solo-graines/${new Date().toISOString().replace(/[:.]/g, "-")}`)
const graines = (i >= 0 ? args.filter((_, j) => j !== i && j !== i + 1) : args).map(Number)
if (graines.some(g => !Number.isInteger(g) || g < 0)) { console.error("graines : des entiers positifs"); process.exit(2) }
if (!graines.length) graines.push(520, 553)

let rouges = 0
for (const seed of graines) {
  const out = path.join(OUT, `graine-${seed}`)
  fs.mkdirSync(out, { recursive: true })
  console.log(`\n== graine ${seed} (solo : playlist ${playlistDe(seed)}, chrono : playlist ${playlistDe(seed + 7)}) ==`)
  const { checks } = await runBrowser({ seed, out, only: ["solo", "chrono"] })
    .catch(e => ({ checks: [{ label: "navigateur", ok: false, problems: [`arret : ${e.message}`] }] }))
  for (const c of checks) {
    if (!c.ok) rouges++
    console.log(`  ${c.ok ? "[ok]" : "[KO]"} ${c.label}`)
    for (const p of c.problems ?? []) console.log(`       - ${p}`)
    for (const n of c.notes ?? []) console.log(`       . ${n}`)
  }
}
console.log(`\n${rouges ? `${rouges} ECRAN(S) ROUGE(S)` : "TOUT VERT"} sur ${graines.length} graine(s), captures dans ${OUT}`)
process.exit(rouges ? 1 : 0)
