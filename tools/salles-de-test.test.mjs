// Tests de tools/salles-de-test.mjs : les outils E2E ferment leurs salles.
//
//   node --test tools/salles-de-test.test.mjs
//
// Deux sortes de tests :
// - fermerSalles et rattraperSalles contre une fausse base (fonction `lire`) ;
// - le crochet de sortie dans un VRAI processus enfant (code 1, SIGTERM,
//   SIGKILL), avec un faux `docker` en tete du PATH : il journalise les
//   requetes et ne touche aucune base.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { spawn } from "child_process"
import { fileURLToPath } from "url"
import { fermerSalles, rattraperSalles, lireJournal, retenirSalle } from "./salles-de-test.mjs"

const ICI = path.dirname(fileURLToPath(import.meta.url))

// Fausse base : lit les joueurs (id -> [provider, recent]) et note les UPDATE.
// Elle rend toujours le code pour un UPDATE : le filtre a verifier est celui
// du SQL envoye, pas une copie de ce filtre ici.
const fausseBase = joueurs => {
  const updates = []
  const lire = sql => {
    if (sql.startsWith("SELECT")) {
      const ids = (sql.match(/IN \(([\d,]+)\)/)?.[1] ?? "").split(",").filter(Boolean)
      return ids.filter(id => joueurs[id]).map(id => `${id}|${joueurs[id][0]}|${joueurs[id][1] ? "t" : "f"}`).join("\n")
    }
    updates.push(sql)
    return sql.match(/room_code='([A-Z0-9]{6})'/)?.[1] ?? ""
  }
  return { lire, updates }
}
const dev = { 5: ["guest", true], 6: ["guest", true] }

test("fermerSalles : passe la salle en 'finished', filtree par code ET hote du script", () => {
  const { lire, updates } = fausseBase(dev)
  assert.deepEqual(fermerSalles(lire, new Map([["VLKAH9", "5"]])), ["VLKAH9"])
  assert.equal(updates.length, 1)
  assert.match(updates[0], /SET status='finished', completed_at=COALESCE\(completed_at, NOW\(\)\)/)
  assert.match(updates[0], /WHERE room_code='VLKAH9' AND host_user_id=5\s/)
  assert.match(updates[0], /AND status IS DISTINCT FROM 'finished'/)
})

test("fermerSalles : la salle d'un autre hote n'est jamais visee, le SQL porte l'hote du script", () => {
  // MAS2L3 appartient a 6 ; le script (hote 5) l'a retenue par erreur. La
  // requete doit exiger host_user_id=5 : en base, elle ne touche donc rien.
  const { lire, updates } = fausseBase(dev)
  fermerSalles(lire, new Map([["MAS2L3", "5"]]))
  assert.match(updates[0], /room_code='MAS2L3' AND host_user_id=5\s/)
  assert.doesNotMatch(updates[0], /host_user_id=6/)
  assert.doesNotMatch(updates[0], /\bOR\b/)
})

test("fermerSalles : un hote qui n'est pas un joueur de test arrete tout, rien n'est ecrit", () => {
  const { lire, updates } = fausseBase({ 6: ["local", false] })
  assert.throws(() => fermerSalles(lire, new Map([["AAAAAA", "6"]])), /joueur de test/)
  assert.equal(updates.length, 0)
})

test("fermerSalles : un hote absent de la base visee est signale, et rien n'est ecrit", (t) => {
  const erreurs = t.mock.method(console, "error", () => {})
  const { lire, updates } = fausseBase(dev)
  assert.deepEqual(fermerSalles(lire, new Map([["BBBBBB", "48211"]])), [])
  assert.equal(updates.length, 0)
  assert.match(String(erreurs.mock.calls[0].arguments[0]), /BBBBBB non fermee : hote 48211 absent/)
})

test("fermerSalles : verifie les hotes sur 4 h (un outil peut durer plus d'1 h)", () => {
  let select = ""
  fermerSalles(sql => { if (sql.startsWith("SELECT")) select = sql; return "5|guest|t" }, new Map([["CCCCCC", "5"]]))
  assert.match(select, /INTERVAL '4 hour'/)
})

test("retenirSalle : refuse un code ou un id mal formes, signale une salle sans hote", (t) => {
  const erreurs = t.mock.method(console, "error", () => {})
  const journal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "salles-")), "j.txt")
  assert.throws(() => retenirSalle("AB'; DROP TABLE x", 5, journal), /code de salle inattendu/)
  assert.throws(() => retenirSalle("ABCDEF", "5 OR 1=1", journal), /id inattendu/)
  assert.equal(retenirSalle("ABCDEF", null, journal), "ABCDEF")
  assert.match(String(erreurs.mock.calls[0].arguments[0]), /salle non retenue .* ne sera PAS fermee/)
  assert.equal(fs.existsSync(journal), false) // rien n'est note, aucun crochet pose
})

test("rattraperSalles : ferme les salles d'un outil mort, jamais celles d'un outil vivant", (t) => {
  t.mock.method(console, "log", () => {})
  const journal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "salles-")), "j.txt")
  fs.writeFileSync(journal, "DEADAA:5:111\nVIVANT:6:222\nillisible\n")
  const { lire, updates } = fausseBase(dev)
  const fermees = rattraperSalles({ lire, fichier: journal, vivant: pid => pid === 222 })
  assert.deepEqual(fermees, ["DEADAA"])
  assert.equal(updates.length, 1)
  assert.match(updates[0], /room_code='DEADAA' AND host_user_id=5\s/)
  assert.deepEqual(lireJournal(journal), [{ code: "VIVANT", hote: "6", pid: 222 }])
})

test("rattraperSalles : un hote trop ancien ne leve pas, la salle sort du journal avec un message", (t) => {
  const erreurs = t.mock.method(console, "error", () => {})
  const journal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "salles-")), "j.txt")
  fs.writeFileSync(journal, "VIEUXA:5:111\n")
  const { lire, updates } = fausseBase({ 5: ["guest", false] })
  assert.deepEqual(rattraperSalles({ lire, fichier: journal, vivant: () => false }), [])
  assert.equal(updates.length, 0)
  assert.match(String(erreurs.mock.calls[0].arguments[0]), /NON fermee.*VIEUXA/)
  assert.deepEqual(lireJournal(journal), [])
})

// ---- Le crochet dans un vrai processus ----

// Un faux docker : note chaque requete, repond en joueur de test pour les
// SELECT et rend le code de salle pour les UPDATE.
function bac() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "salles-crochet-"))
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
if (mode === "code1") process.exit(1)
if (mode === "exception") throw new Error("plante en route")
if (mode === "attente") { console.log("PRET"); setInterval(() => {}, 1000) }
`)
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, SALLES_JOURNAL_DIR: path.join(dir, "journal") }
  const lancer = (...args) => spawn(process.execPath, [script, ...args], { env, stdio: ["ignore", "pipe", "pipe"] })
  const requetes = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "")
  const journal = () => {
    const d = path.join(dir, "journal")
    return fs.existsSync(d) ? fs.readdirSync(d).map(f => fs.readFileSync(path.join(d, f), "utf8")).join("") : ""
  }
  return { lancer, requetes, journal }
}

const fin = enfant => new Promise(resolve => enfant.on("exit", (code, signal) => resolve({ code, signal })))
const pret = enfant => new Promise(resolve => enfant.stdout.on("data", d => { if (String(d).includes("PRET")) resolve() }))

for (const mode of ["code1", "exception"]) {
  test(`crochet : sortie en echec (${mode}) : la salle est fermee et sort du journal`, async () => {
    const b = bac()
    await fin(b.lancer(mode, "EXITAA"))
    assert.match(b.requetes(), /UPDATE multiplayer_rooms SET status='finished'[\s\S]*room_code='EXITAA' AND host_user_id=5/)
    assert.equal(b.journal(), "")
  })
}

test("crochet : vrai SIGTERM : la salle est fermee, code 130", async () => {
  const b = bac()
  const enfant = b.lancer("attente", "TERMAA")
  await pret(enfant)
  enfant.kill("SIGTERM")
  const { code } = await fin(enfant)
  assert.equal(code, 130)
  assert.match(b.requetes(), /room_code='TERMAA' AND host_user_id=5/)
  assert.equal(b.journal(), "")
})

test("crochet : SIGKILL ne ferme rien, le prochain outil rattrape la salle", async () => {
  const b = bac()
  const tue = b.lancer("attente", "KILLAA")
  await pret(tue)
  tue.kill("SIGKILL")
  await fin(tue)
  assert.doesNotMatch(b.requetes(), /UPDATE/)
  assert.match(b.journal(), /^KILLAA:5:\d+\n$/)

  await fin(b.lancer("code1", "SUIVAN")) // un autre outil demarre et cree sa salle
  assert.match(b.requetes(), /room_code='KILLAA' AND host_user_id=5/)
  assert.match(b.requetes(), /room_code='SUIVAN' AND host_user_id=5/)
  assert.equal(b.journal(), "")
})
