// Tests de la cible et des gardes de tools/seed-library.mjs, sans base : la
// lecture SQL est remplacee par une fausse, qui joue une base de prod et une
// base de dev ayant chacune leurs propres ids (la situation depuis C0).
//
//   node --test tools/seed-library.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { cibleSeed, verifierJoueursDeTest, fermerSalles, retenirSalle } from "./seed-library.mjs"

// Fausse base : id -> [provider, cree il y a moins d'une heure]
const fausseBase = lignes => sql => {
  const ids = (sql.match(/IN \(([\d,]+)\)/)?.[1] ?? "").split(",").filter(Boolean)
  return ids.filter(id => lignes[id]).map(id => `${id}|${lignes[id][0]}|${lignes[id][1] ? "t" : "f"}`).join("\n")
}
// En prod, les petits ids sont de vrais joueurs anciens ; les invites des
// outils ont des ids recents et grands. En dev, les ids repartent de 1.
const prod = fausseBase({ 5: ["guest", false], 6: ["local", false], 48211: ["guest", true] })
const dev = fausseBase({ 5: ["guest", true], 6: ["guest", true] })

test("la cible suit le mode de l'outil : prod seulement avec l'argument prod", () => {
  assert.deepEqual(cibleSeed(["node", "soiree.mjs", "prod"], {}),
    { mode: "prod", container: "blindify-postgres", user: "blindify", db: "blindify" })
  assert.deepEqual(cibleSeed(["node", "soiree.mjs"], {}),
    { mode: "dev", container: "blindz-dev-postgres", user: "blindz_dev", db: "blindify_dev" })
  assert.equal(cibleSeed(["node", "pcfixes-e2e.mjs", "--pile"], {}).mode, "dev")
})

test("en mode dev, aucune surcharge ne peut viser la prod", () => {
  assert.throws(() => cibleSeed(["node", "x.mjs"], { SEED_PG_CONTAINER: "blindify-postgres" }), /prod/)
  assert.throws(() => cibleSeed(["node", "x.mjs"], { SEED_PG_DB: "blindify" }), /prod/)
  assert.equal(cibleSeed(["node", "x.mjs"], { SEED_PG_CONTAINER: "essai" }).container, "essai")
})

test("un id du dev, en mode prod, est refuse : c'est un vrai joueur ancien de la prod", () => {
  assert.throws(() => verifierJoueursDeTest([5], prod, { exiger: true }), /joueur de test/)
  assert.throws(() => verifierJoueursDeTest([6], prod, { exiger: true }), /joueur de test/)
})

test("un id de la prod, en mode dev, est refuse : il n'existe pas dans la base du dev", () => {
  assert.throws(() => verifierJoueursDeTest([48211], dev, { exiger: true }), /absent/)
})

test("un invite recent de la base visee passe, dans les deux modes", () => {
  assert.deepEqual(verifierJoueursDeTest([48211], prod, { exiger: true }), ["48211"])
  assert.deepEqual(verifierJoueursDeTest([5, 6], dev, { exiger: true }), ["5", "6"])
})

test("au menage, un id absent est ignore mais un vrai joueur arrete tout", () => {
  assert.deepEqual(verifierJoueursDeTest([48211, 99999], prod), ["48211"])
  assert.throws(() => verifierJoueursDeTest([48211, 5], prod), /joueur de test/)
})

test("la requete rend t ou f explicitement : un booleen colle par || donnerait true", () => {
  // Trouve a l'essai reel du 11/10 : id||'|'||(created_at > ...) rend "true",
  // et une garde qui attendait "t" refusait meme les vrais joueurs de test.
  let requete = ""
  verifierJoueursDeTest([5], sql => { requete = sql; return "5|guest|t" }, { exiger: true })
  assert.match(requete, /CASE WHEN created_at > NOW\(\) - INTERVAL '1 hour' THEN 't' ELSE 'f' END/)
})

test("un id qui n'est pas un entier est refuse avant toute lecture", () => {
  let lu = false
  assert.throws(() => verifierJoueursDeTest(["5); DROP TABLE users"], () => { lu = true; return "" }), /id inattendu/)
  assert.equal(lu, false)
})

// Fermeture des salles a la sortie (T4, 31/10) : soiree.mjs laissait sa salle
// en 'in_progress', et attendre-parties.sh la prenait pour une vraie partie.
// Fausse base des salles : lit les joueurs comme `dev`, et pour l'UPDATE rend
// les codes qui correspondent (code ET hote, salle pas encore finie).
const baseSalles = (joueurs, salles) => {
  const updates = []
  const lire = sql => {
    if (sql.startsWith("SELECT")) return joueurs(sql)
    updates.push(sql)
    const code = sql.match(/room_code='([A-Z0-9]{6})'/)?.[1]
    const hote = sql.match(/host_user_id=(\d+)/)?.[1]
    const s = salles[code]
    if (!s || String(s.hote) !== hote || s.status === "finished") return ""
    s.status = "finished"
    return code
  }
  return { lire, updates }
}

test("fermerSalles : ferme la salle du script, filtre par code ET hote", () => {
  const salles = { VLKAH9: { hote: 5, status: "in_progress" } }
  const { lire, updates } = baseSalles(dev, salles)
  assert.deepEqual(fermerSalles(lire, new Map([["VLKAH9", "5"]])), ["VLKAH9"])
  assert.equal(salles.VLKAH9.status, "finished")
  assert.match(updates[0], /SET status='finished'/)
  assert.match(updates[0], /WHERE room_code='VLKAH9' AND host_user_id=5/)
  assert.match(updates[0], /status IS DISTINCT FROM 'finished'/)
})

test("fermerSalles : jamais la salle d'un autre hote, meme avec le bon code", () => {
  const salles = { MAS2L3: { hote: 6, status: "in_progress" } } // salle de 6, pas de 5
  const { lire } = baseSalles(dev, salles)
  assert.deepEqual(fermerSalles(lire, new Map([["MAS2L3", "5"]])), [])
  assert.equal(salles.MAS2L3.status, "in_progress")
})

test("fermerSalles : un hote qui n'est pas un joueur de test arrete tout, rien n'est ecrit", () => {
  const { lire, updates } = baseSalles(prod, { AAAAAA: { hote: 6, status: "in_progress" } })
  assert.throws(() => fermerSalles(lire, new Map([["AAAAAA", "6"]])), /joueur de test/)
  assert.equal(updates.length, 0)
})

test("fermerSalles : un hote absent de la base visee (l'autre base) est ignore", () => {
  const { lire, updates } = baseSalles(dev, {})
  assert.deepEqual(fermerSalles(lire, new Map([["BBBBBB", "48211"]])), [])
  assert.equal(updates.length, 0)
})

test("fermerSalles : une salle deja finie n'est pas recomptee, la liste est videe", () => {
  const salles = { CCCCCC: { hote: 5, status: "finished" } }
  const { lire } = baseSalles(dev, salles)
  const liste = new Map([["CCCCCC", "5"]])
  assert.deepEqual(fermerSalles(lire, liste), [])
  assert.equal(liste.size, 0)
})

test("retenirSalle : refuse un code ou un id qui n'a pas la forme attendue", () => {
  assert.throws(() => retenirSalle("AB'; DROP TABLE x", 5), /code de salle inattendu/)
  assert.throws(() => retenirSalle("ABCDEF", "5 OR 1=1"), /id inattendu/)
  assert.equal(retenirSalle(null, 5), null) // code absent : rien a retenir
})
