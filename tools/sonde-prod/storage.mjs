// Etat et journal de la sonde, hors du depot. L'unite systemd cree les dossiers
// (StateDirectory, LogsDirectory) ; a la main, on les cree en 700.
import fs from "node:fs"
import path from "node:path"
import { INITIAL_STATE, normalizeState } from "./decision.mjs"

export const STATE_PATH = "/var/lib/blindz-sonde-prod/etat.json"

/** Etat precedent. Absent : etat initial. Illisible : etat initial et un avertissement. */
export function loadState(file) {
  let text
  try {
    text = fs.readFileSync(file, "utf8")
  } catch (err) {
    if (err?.code === "ENOENT") return { state: INITIAL_STATE, warning: null }
    return { state: INITIAL_STATE, warning: `etat illisible (${err?.code ?? err?.message}), on repart de zero` }
  }
  try {
    // normalizeState renvoie INITIAL_STATE lui-meme quand un champ est invalide.
    const state = normalizeState(JSON.parse(text))
    return { state, warning: state === INITIAL_STATE ? "etat invalide, on repart de zero" : null }
  } catch {
    return { state: INITIAL_STATE, warning: "etat illisible (JSON casse), on repart de zero" }
  }
}

/** Ecriture atomique (fichier temporaire puis rename), lisible par root seul. */
export function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function appendLog(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.appendFileSync(file, `${line}\n`, { mode: 0o600 })
}
