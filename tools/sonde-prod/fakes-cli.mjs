// Prechargement pour sonde.test.mjs (node --import) : la vraie ligne de
// commande (sonde.mjs) tourne contre les faux de fakes.mjs, pour lire son code
// de sortie. Le reseau est remplace (globalThis.fetch) et les pauses sont
// instantanees (globalThis.setTimeout, que seule la pause entre deux essais
// utilise). Scenario dans SONDE_ESSAI_SCENARIO. Jamais copie sur le serveur.
import { prodRoutes, quickPlayKo, json, fakeFetch } from "./fakes.mjs"

const SCENARIOS = {
  vert: () => prodRoutes(),
  panne: () => prodRoutes({
    quickPlay: () => quickPlayKo("insufficient_tracks", 400, { needed: 10, found: 1 }),
    deezerSearch: () => json({ data: [] }),
  }),
}

const scenario = SCENARIOS[process.env.SONDE_ESSAI_SCENARIO]
if (!scenario) throw new Error(`SONDE_ESSAI_SCENARIO inconnu : ${process.env.SONDE_ESSAI_SCENARIO}`)
globalThis.fetch = fakeFetch(scenario()).fn
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args)
