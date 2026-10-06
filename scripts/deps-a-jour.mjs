#!/usr/bin/env node
// Les node_modules d'un dossier correspondent-ils a son package-lock.json ?
//
//   node scripts/deps-a-jour.mjs frontend     code 0 : a jour ; code 1 : ecarts listes
//
// Pourquoi : la prod du front est construite depuis /opt/blindify/frontend avec
// ses node_modules. Quand une PR Dependabot est fusionnee, main change de
// lockfile mais les node_modules du serveur restent les anciens : sans ce
// controle, la prod serait construite avec d'autres versions que celles que la
// CI a testees. npm tient dans node_modules/.package-lock.json la liste de ce
// qui est vraiment installe : on la compare au lockfile.
import { readFileSync } from "node:fs"
import path from "node:path"

const dir = path.resolve(process.argv[2] ?? ".")
const lire = (fichier) => JSON.parse(readFileSync(path.join(dir, fichier), "utf8")).packages ?? {}

let voulu, installe
try {
  voulu = lire("package-lock.json")
  installe = lire("node_modules/.package-lock.json")
} catch (err) {
  console.log(`  dependances : lecture impossible (${err.message})`)
  process.exit(1)
}

const ecarts = []
for (const [cle, paquet] of Object.entries(voulu)) {
  if (cle === "" || paquet.link) continue
  const present = installe[cle]
  // Une dependance optionnelle d'une autre plateforme n'est jamais installee.
  if (!present) {
    if (!paquet.optional) ecarts.push(`${cle} : absent (attendu ${paquet.version})`)
    continue
  }
  if (present.version !== paquet.version) ecarts.push(`${cle} : ${present.version} installe, ${paquet.version} attendu`)
}
for (const cle of Object.keys(installe)) {
  if (!(cle in voulu)) ecarts.push(`${cle} : installe mais absent du lockfile`)
}

if (ecarts.length === 0) {
  console.log(`  dependances de ${path.basename(dir)} a jour (${Object.keys(voulu).length - 1} paquets)`)
  process.exit(0)
}
console.log(`  dependances de ${path.basename(dir)} en retard sur le lockfile (${ecarts.length} ecarts) :`)
for (const e of ecarts.slice(0, 15)) console.log(`    ${e}`)
if (ecarts.length > 15) console.log(`    ... et ${ecarts.length - 15} autres`)
process.exit(1)
