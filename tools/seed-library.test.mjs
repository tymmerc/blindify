// Tests de la cible et des gardes de tools/seed-library.mjs, sans base : la
// lecture SQL est remplacee par une fausse, qui joue une base de prod et une
// base de dev ayant chacune leurs propres ids (la situation depuis C0).
//
//   node --test tools/seed-library.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { cibleSeed, verifierJoueursDeTest } from "./seed-library.mjs"

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
