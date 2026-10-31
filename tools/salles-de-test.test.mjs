// Tests de tools/salles-de-test.mjs : les outils E2E ferment leurs salles.
//
//   node --test tools/salles-de-test.test.mjs
//
// Deux sortes de tests :
// - fermerUne, fermerLot, rattraperSalles contre une fausse base (fonction
//   `lire`) et des journaux dans un dossier temporaire ;
// - le crochet de sortie dans un VRAI processus enfant (code 1, exception,
//   SIGTERM, SIGKILL, journal bloque), avec un faux `docker` en tete du PATH :
//   il note les requetes et ne touche aucune base.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { spawn } from "child_process"
import { fileURLToPath } from "url"
import { fermerUne, fermerLot, rattraperSalles, lireJournal, retenirSalle, dossierSur, journalDe } from "./salles-de-test.mjs"

const ICI = path.dirname(fileURLToPath(import.meta.url))
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "salles-"))

// Fausse base. joueurs : id -> [provider, recent]. Elle rend le code pour tout
// UPDATE : le filtre a verifier est celui du SQL envoye, pas une copie ici.
// panne : fonction (sql) -> vrai pour simuler une panne de psql.
const fausseBase = (joueurs, panne = () => false) => {
  const updates = []
  const lire = sql => {
    if (panne(sql)) throw new Error("docker: Cannot connect to the Docker daemon\nplus de details")
    if (sql.startsWith("SELECT")) {
      const ids = (sql.match(/IN \(([\d,]+)\)/)?.[1] ?? "").split(",").filter(Boolean)
      return ids.filter(id => joueurs[id]).map(id => `${id}|${joueurs[id][0]}|${joueurs[id][1] ? "t" : "f"}`).join("\n")
    }
    updates.push(sql)
    return sql.match(/room_code='([A-Z0-9]{6})'/)?.[1] ?? ""
  }
  return { lire, updates }
}
const dev = { 5: ["guest", true], 6: ["guest", true], 7: ["guest", false] }
const silence = t => ({
  erreurs: t.mock.method(console, "error", () => {}),
  logs: t.mock.method(console, "log", () => {}),
})
const messages = m => m.mock.calls.map(c => String(c.arguments[0])).join("\n")

// ---- fermerUne ----

test("fermerUne : passe la salle en 'finished', filtree par code ET hote du script", () => {
  const { lire, updates } = fausseBase(dev)
  assert.equal(fermerUne("VLKAH9", "5", lire), "fermee")
  assert.equal(updates.length, 1)
  assert.match(updates[0], /SET status='finished', completed_at=COALESCE\(completed_at, NOW\(\)\)/)
  assert.match(updates[0], /WHERE room_code='VLKAH9' AND host_user_id=5\s/)
  assert.match(updates[0], /AND status IS DISTINCT FROM 'finished'/)
})

test("fermerUne : la salle d'un autre hote n'est jamais visee, le SQL porte l'hote du script", () => {
  // MAS2L3 appartient a 6 ; le script (hote 5) l'a retenue par erreur. La
  // requete exige host_user_id=5 : en base, elle ne touche donc rien.
  const { lire, updates } = fausseBase(dev)
  fermerUne("MAS2L3", "5", lire)
  assert.match(updates[0], /room_code='MAS2L3' AND host_user_id=5\s/)
  assert.doesNotMatch(updates[0], /host_user_id=6/)
  assert.doesNotMatch(updates[0], /\bOR\b/)
})

test("fermerUne : verifie l'hote sur 4 h (un outil peut durer plus d'1 h)", () => {
  let select = ""
  fermerUne("CCCCCC", "5", sql => { if (sql.startsWith("SELECT")) select = sql; return "5|guest|t" })
  assert.match(select, /INTERVAL '4 hour'/)
})

test("fermerUne : hote refuse, absent ou panne : trois issues distinctes, signalees, sans lever", (t) => {
  const { erreurs } = silence(t)
  const vrai = fausseBase({ 6: ["local", false] })
  assert.equal(fermerUne("AAAAAA", "6", vrai.lire), "refuse")
  assert.equal(vrai.updates.length, 0)
  assert.equal(fermerUne("BBBBBB", "48211", fausseBase(dev).lire), "absent")
  assert.equal(fermerUne("DDDDDD", "5", fausseBase(dev, () => true).lire), "erreur")
  const texte = messages(erreurs)
  assert.match(texte, /AAAAAA non fermee : .*n'est pas un joueur de test/)
  assert.match(texte, /BBBBBB non fermee : hote 48211 absent/)
  assert.match(texte, /DDDDDD non fermee, panne passagere \(docker: Cannot connect to the Docker daemon\) : gardee/)
})

// ---- fermerLot ----

test("fermerLot : un lot mixte, le recent est ferme, le perime est ecarte avec un message", (t) => {
  const { erreurs } = silence(t)
  const { lire, updates } = fausseBase(dev)
  const lot = fermerLot([{ code: "VIEUXA", hote: "7" }, { code: "RECENT", hote: "5" }], lire)
  assert.deepEqual(lot, { fermees: ["RECENT"], aGarder: [] })
  assert.equal(updates.length, 1)
  assert.match(updates[0], /room_code='RECENT' AND host_user_id=5\s/)
  assert.match(messages(erreurs), /VIEUXA non fermee : .*moins de 4 h/)
})

test("fermerLot : une panne psql garde l'entree, les autres sont fermees", (t) => {
  silence(t)
  const { lire } = fausseBase(dev, sql => sql.includes("PANNEA"))
  const lot = fermerLot([{ code: "PANNEA", hote: "5" }, { code: "BONNEA", hote: "6" }], lire)
  assert.deepEqual(lot, { fermees: ["BONNEA"], aGarder: [{ code: "PANNEA", hote: "5" }] })
})

// ---- rattraperSalles ----

test("rattraperSalles : lot mixte d'un outil mort, le recent est ferme, le perime sort, le fichier disparait", (t) => {
  const { erreurs } = silence(t)
  const dossier = tmp()
  const mort = journalDe(111, dossier)
  fs.writeFileSync(mort, "VIEUXA:7\nRECENT:5\nillisible\n")
  const { lire, updates } = fausseBase(dev)
  assert.deepEqual(rattraperSalles({ lire, dossier, vivant: () => false }), ["RECENT"])
  assert.equal(updates.length, 1)
  assert.equal(fs.existsSync(mort), false)
  assert.match(messages(erreurs), /VIEUXA non fermee/)
})

test("rattraperSalles : sur une panne psql, l'entree reste dans le journal", (t) => {
  silence(t)
  const dossier = tmp()
  const mort = journalDe(111, dossier)
  fs.writeFileSync(mort, "PANNEA:5\nBONNEA:6\n")
  const { lire } = fausseBase(dev, sql => sql.includes("PANNEA"))
  assert.deepEqual(rattraperSalles({ lire, dossier, vivant: () => false }), ["BONNEA"])
  assert.deepEqual(lireJournal(mort), [{ code: "PANNEA", hote: "5" }])
})

test("rattraperSalles : jamais le journal d'un processus vivant, ni un lien symbolique", (t) => {
  const { erreurs } = silence(t)
  const dossier = tmp()
  const vivant = journalDe(222, dossier)
  fs.writeFileSync(vivant, "VIVANT:6\n")
  const cible = path.join(tmp(), "ailleurs.txt")
  fs.writeFileSync(cible, "PIEGEA:5\n")
  fs.symlinkSync(cible, journalDe(333, dossier))
  const { lire, updates } = fausseBase(dev)
  assert.deepEqual(rattraperSalles({ lire, dossier, vivant: pid => pid === 222 }), [])
  assert.equal(updates.length, 0)
  assert.deepEqual(lireJournal(vivant), [{ code: "VIVANT", hote: "6" }])
  assert.match(messages(erreurs), /journal .*333\.txt ignore \(pas un fichier a nous\)/)
})

test("rattraperSalles : un dossier illisible ne leve pas", (t) => {
  const { erreurs } = silence(t)
  const fichier = path.join(tmp(), "pas-un-dossier")
  fs.writeFileSync(fichier, "")
  assert.deepEqual(rattraperSalles({ lire: fausseBase(dev).lire, dossier: fichier, vivant: () => false }), [])
  assert.match(messages(erreurs), /journal des salles refuse/)
})

// ---- dossierSur ----

test("dossierSur : cree en 0700, resserre un dossier trop ouvert, refuse un lien symbolique", (t) => {
  const { erreurs } = silence(t)
  const neuf = path.join(tmp(), "neuf")
  assert.equal(dossierSur(neuf), neuf)
  assert.equal(fs.statSync(neuf).mode & 0o777, 0o700)
  const ouvert = path.join(tmp(), "ouvert")
  fs.mkdirSync(ouvert, { mode: 0o755 })
  fs.chmodSync(ouvert, 0o755)
  assert.equal(dossierSur(ouvert), ouvert)
  assert.equal(fs.statSync(ouvert).mode & 0o777, 0o700)
  const lien = path.join(tmp(), "lien")
  fs.symlinkSync(neuf, lien)
  assert.equal(dossierSur(lien), null)
  assert.match(messages(erreurs), /journal des salles refuse .*pas un vrai dossier/)
})

// ---- retenirSalle (sans poser de crochet dans ce processus) ----

test("retenirSalle : refuse un code ou un id mal formes, signale une salle sans hote", (t) => {
  const { erreurs } = silence(t)
  const dossier = tmp()
  assert.throws(() => retenirSalle("AB'; DROP TABLE x", 5, { dossier }), /code de salle inattendu/)
  assert.throws(() => retenirSalle("ABCDEF", "5 OR 1=1", { dossier }), /id inattendu/)
  assert.equal(retenirSalle("ABCDEF", null, { dossier }), "ABCDEF")
  assert.match(messages(erreurs), /salle non retenue .* ne sera PAS fermee/)
  assert.deepEqual(fs.readdirSync(dossier), []) // rien de note, aucun crochet pose
})

// ---- Le crochet dans un vrai processus ----

// Un faux docker : note chaque requete, repond en joueur de test pour les
// SELECT et rend le code de salle pour les UPDATE.
function bac({ journal } = {}) {
  const dir = tmp()
  const bin = path.join(dir, "bin")
  fs.mkdirSync(bin)
  const log = path.join(dir, "requetes.log")
  fs.writeFileSync(path.join(bin, "docker"), `#!/bin/sh
for a; do sql="$a"; done
printf '%s\\n---\\n' "$sql" >> "${log}"
case "$sql" in
  SELECT*) echo "$sql" | grep -o 'IN ([0-9,]*)' | grep -o '[0-9][0-9]*' | sed 's/$/|guest|t/' ;;
  UPDATE*) echo "$sql" | grep -o "room_code='[A-Z0-9]*'" | cut -d"'" -f2 ;;
esac
`, { mode: 0o755 })
  const script = path.join(dir, "outil.mjs")
  fs.writeFileSync(script, `import { retenirSalle } from ${JSON.stringify(path.join(ICI, "salles-de-test.mjs"))}
const [mode, code] = process.argv.slice(2)
retenirSalle(code, 5)
console.log("RETENUE")
if (mode === "code1") process.exit(1)
if (mode === "exception") throw new Error("plante en route")
if (mode === "attente") { console.log("PRET"); setInterval(() => {}, 1000) }
`)
  const dossier = journal ?? path.join(dir, "journal")
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, SALLES_JOURNAL_DIR: dossier }
  const lancer = (...args) => {
    const enfant = spawn(process.execPath, [script, ...args], { env, stdio: ["ignore", "pipe", "pipe"] })
    enfant.sortie = ""
    enfant.stdout.on("data", d => { enfant.sortie += d })
    enfant.stderr.on("data", d => { enfant.sortie += d })
    return enfant
  }
  const requetes = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "")
  const fichiers = () => (fs.existsSync(dossier) && fs.statSync(dossier).isDirectory() ? fs.readdirSync(dossier) : [])
  return { lancer, requetes, fichiers, dossier }
}

const fin = enfant => new Promise(resolve => enfant.on("exit", (code, signal) => resolve({ code, signal })))
const pret = enfant => new Promise(resolve => enfant.stdout.on("data", d => { if (String(d).includes("PRET")) resolve() }))

for (const mode of ["code1", "exception"]) {
  test(`crochet : sortie en echec (${mode}) : la salle est fermee, le journal du processus supprime`, async () => {
    const b = bac()
    const { code } = await fin(b.lancer(mode, "EXITAA"))
    assert.equal(code, 1)
    assert.match(b.requetes(), /UPDATE multiplayer_rooms SET status='finished'[\s\S]*room_code='EXITAA' AND host_user_id=5/)
    assert.deepEqual(b.fichiers(), [])
    assert.equal((fs.statSync(b.dossier).mode & 0o777), 0o700)
  })
}

test("crochet : vrai SIGTERM : la salle est fermee, code 143", async () => {
  const b = bac()
  const enfant = b.lancer("attente", "TERMAA")
  await pret(enfant)
  enfant.kill("SIGTERM")
  const { code } = await fin(enfant)
  assert.equal(code, 143)
  assert.match(b.requetes(), /room_code='TERMAA' AND host_user_id=5/)
  assert.deepEqual(b.fichiers(), [])
})

test("crochet : SIGKILL ne ferme rien, le prochain outil rattrape la salle", async () => {
  const b = bac()
  const tue = b.lancer("attente", "KILLAA")
  await pret(tue)
  tue.kill("SIGKILL")
  await fin(tue)
  assert.doesNotMatch(b.requetes(), /UPDATE/)
  assert.deepEqual(b.fichiers(), [`salles-blindz-dev-postgres-blindify_dev-${tue.pid}.txt`])

  await fin(b.lancer("code1", "SUIVAN")) // un autre outil demarre et cree sa salle
  assert.match(b.requetes(), /room_code='KILLAA' AND host_user_id=5/)
  assert.match(b.requetes(), /room_code='SUIVAN' AND host_user_id=5/)
  assert.deepEqual(b.fichiers(), [])
})

test("crochet : journal impossible (le dossier est un fichier) : l'outil ne plante pas et ferme sa salle", async () => {
  const bloque = path.join(tmp(), "fichier-pas-dossier")
  fs.writeFileSync(bloque, "")
  const b = bac({ journal: bloque })
  const enfant = b.lancer("code1", "SANSJR")
  const { code } = await fin(enfant)
  assert.equal(code, 1) // le code de l'outil, pas un plantage
  assert.match(enfant.sortie, /RETENUE/)
  assert.match(enfant.sortie, /journal des salles refuse/)
  assert.match(b.requetes(), /room_code='SANSJR' AND host_user_id=5/)
})
