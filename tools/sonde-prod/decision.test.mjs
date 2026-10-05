// node --test tools/sonde-prod/*.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { decide, commitState, normalizeState, INITIAL_STATE, REMINDER_MS } from "./decision.mjs"

const T0 = "2026-10-05T00:00:00.000Z"
const at = minutes => new Date(Date.parse(T0) + minutes * 60_000).toISOString()

test("premiere sonde verte : aucun e-mail", () => {
  const { state, mail } = decide(null, true, T0)
  assert.equal(mail, null)
  assert.equal(state.announced, "OK")
  assert.equal(state.lastResult, "OK")
  assert.equal(state.lastRunAt, T0)
})

test("OK puis KO : e-mail de panne, debut de panne note", () => {
  const { state, mail } = decide(INITIAL_STATE, false, T0)
  assert.equal(mail, "panne")
  assert.equal(state.announced, "KO")
  assert.equal(state.downSince, T0)
  assert.equal(state.lastAlertAt, T0)
})

test("KO qui dure moins de 6 h : pas de deuxieme e-mail", () => {
  const first = decide(INITIAL_STATE, false, T0).state
  const { state, mail } = decide(first, false, at(65 * 5))
  assert.equal(mail, null)
  assert.equal(state.downSince, T0)
  assert.equal(state.lastAlertAt, T0)
})

test("KO depuis 6 h : un rappel, puis plus rien pendant 6 h", () => {
  const first = decide(INITIAL_STATE, false, T0).state
  const reminder = decide(first, false, at(360))
  assert.equal(reminder.mail, "rappel")
  assert.equal(reminder.state.lastAlertAt, at(360))
  assert.equal(reminder.state.downSince, T0)
  assert.equal(decide(reminder.state, false, at(360 + 65)).mail, null)
})

test("KO puis OK : e-mail « c'est reparti », panne effacee", () => {
  const down = decide(INITIAL_STATE, false, T0).state
  const { state, mail } = decide(down, true, at(130))
  assert.equal(mail, "retour")
  assert.equal(state.announced, "OK")
  assert.equal(state.downSince, null)
})

test("OK qui reste OK : jamais d'e-mail", () => {
  const ok = decide(INITIAL_STATE, true, T0).state
  assert.equal(decide(ok, true, at(65)).mail, null)
  assert.equal(decide(ok, true, at(10_000)).mail, null)
})

test("une journee type : panne de 3 h 15 puis retour, deux e-mails seulement", () => {
  const results = [true, true, false, false, false, true, true]
  const mails = results.reduce(
    (acc, ok, i) => {
      const d = decide(acc.state, ok, at(i * 65))
      return { state: d.state, mails: d.mail ? [...acc.mails, d.mail] : acc.mails }
    },
    { state: INITIAL_STATE, mails: [] },
  ).mails
  assert.deepEqual(mails, ["panne", "retour"])
})

test("une longue panne de 13 h : panne, puis un rappel toutes les 6 h", () => {
  const steps = Array.from({ length: 13 }, (_, i) => i * 65) // 0 -> 780 min
  const mails = steps.reduce(
    (acc, minutes) => {
      const d = decide(acc.state, false, at(minutes))
      return { state: d.state, mails: d.mail ? [...acc.mails, `${d.mail}@${minutes}`] : acc.mails }
    },
    { state: INITIAL_STATE, mails: [] },
  ).mails
  assert.deepEqual(mails, ["panne@0", "rappel@390", "rappel@780"])
})

test("rappel a exactement 6 h, pas une minute avant", () => {
  const down = decide(INITIAL_STATE, false, T0).state
  assert.equal(decide(down, false, at(359)).mail, null)
  assert.equal(decide(down, false, new Date(Date.parse(T0) + REMINDER_MS).toISOString()).mail, "rappel")
})

test("e-mail de panne pas parti : Tym ne sait rien, la sonde suivante le retente", () => {
  const decision = decide(INITIAL_STATE, false, T0)
  const kept = commitState(INITIAL_STATE, decision, false)
  assert.equal(kept.announced, "OK")
  assert.equal(kept.lastAlertAt, null)
  assert.equal(kept.downSince, T0, "le debut de la panne est garde pour la duree")
  const retry = decide(kept, false, at(65))
  assert.equal(retry.mail, "panne")
  assert.equal(retry.state.downSince, T0)
})

test("e-mail de retour pas parti : il repart a la sonde verte suivante, avec la duree", () => {
  const down = decide(INITIAL_STATE, false, T0).state
  const decision = decide(down, true, at(130))
  const kept = commitState(down, decision, false)
  assert.equal(kept.announced, "KO")
  assert.equal(kept.downSince, T0)
  assert.equal(kept.lastResult, "OK")
  assert.equal(decide(kept, true, at(195)).mail, "retour")
})

test("rappel pas parti : retente au passage suivant", () => {
  const down = decide(INITIAL_STATE, false, T0).state
  const decision = decide(down, false, at(390))
  assert.equal(decision.mail, "rappel")
  const kept = commitState(down, decision, false)
  assert.equal(kept.lastAlertAt, T0)
  assert.equal(decide(kept, false, at(455)).mail, "rappel")
})

test("e-mail parti : l'etat decide est garde tel quel", () => {
  const decision = decide(INITIAL_STATE, false, T0)
  assert.deepEqual(commitState(INITIAL_STATE, decision, true), decision.state)
})

test("rien n'est modifie en place", () => {
  const prev = Object.freeze({ ...INITIAL_STATE, announced: "KO", downSince: T0, lastAlertAt: T0 })
  const decision = decide(prev, true, at(65))
  commitState(prev, decision, false)
  assert.equal(prev.announced, "KO")
})

test("etat illisible ou trafique : on repart de l'etat initial", () => {
  assert.equal(normalizeState(null), INITIAL_STATE)
  assert.equal(normalizeState("KO"), INITIAL_STATE)
  assert.equal(normalizeState({ announced: "PANNE" }), INITIAL_STATE)
  assert.equal(normalizeState({ announced: "KO", downSince: "hier" }), INITIAL_STATE)
  assert.equal(normalizeState({ announced: "KO", lastResult: "peut-etre" }), INITIAL_STATE)
  assert.deepEqual(normalizeState({ announced: "KO", downSince: T0 }), { ...INITIAL_STATE, announced: "KO", downSince: T0 })
})
