// Logique de decision de la sonde de prod : quand prevenir Tym, et quoi lui
// dire. Rien ici ne touche au reseau ni au disque, tout est teste par
// decision.test.mjs (node --test).
//
// Machine a etats des alertes (« annonce » = ce que Tym sait deja) :
//   annonce OK + sonde OK -> rien
//   annonce OK + sonde KO -> e-mail « panne », annonce KO
//   annonce KO + sonde KO -> rien, ou un rappel si le dernier e-mail date de 6 h
//   annonce KO + sonde OK -> e-mail « retour » (c'est reparti), annonce OK
// Un e-mail qui ne part pas (Resend en panne, cle absente) ne change pas ce que
// Tym sait : la sonde suivante retentera le meme e-mail (commitState).

export const REMINDER_MS = 6 * 60 * 60 * 1000

/** Etat de depart : premiere sonde, ou fichier d'etat illisible. */
export const INITIAL_STATE = Object.freeze({
  announced: "OK", // dernier etat annonce par e-mail
  downSince: null, // premiere sonde en echec de la panne en cours (ISO)
  lastAlertAt: null, // dernier e-mail de panne ou de rappel (ISO)
  lastRunAt: null,
  lastResult: null, // "OK" | "KO"
})

const isIsoOrNull = v => v === null || (typeof v === "string" && Number.isFinite(Date.parse(v)))

/**
 * Etat relu sur le disque : donnee externe, validee champ par champ. Un champ
 * invalide fait repartir de l'etat initial plutot que d'envoyer un e-mail faux.
 */
export function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return INITIAL_STATE
  const valid =
    (raw.announced === "OK" || raw.announced === "KO") &&
    isIsoOrNull(raw.downSince ?? null) &&
    isIsoOrNull(raw.lastAlertAt ?? null) &&
    isIsoOrNull(raw.lastRunAt ?? null) &&
    [null, "OK", "KO"].includes(raw.lastResult ?? null)
  if (!valid) return INITIAL_STATE
  return {
    announced: raw.announced,
    downSince: raw.downSince ?? null,
    lastAlertAt: raw.lastAlertAt ?? null,
    lastRunAt: raw.lastRunAt ?? null,
    lastResult: raw.lastResult ?? null,
  }
}

/**
 * Decide de l'e-mail a envoyer apres une sonde.
 * @param {object} previous etat precedent (brut ou normalise)
 * @param {boolean} runOk la sonde est-elle passee
 * @param {string} now date ISO de la sonde
 * @returns {{ state: object, mail: null | "panne" | "rappel" | "retour" }}
 */
export function decide(previous, runOk, now, reminderMs = REMINDER_MS) {
  const prev = normalizeState(previous)
  const base = { ...prev, lastRunAt: now, lastResult: runOk ? "OK" : "KO" }
  if (runOk) {
    if (prev.announced === "KO") return { state: { ...base, announced: "OK", downSince: null }, mail: "retour" }
    return { state: { ...base, downSince: null }, mail: null }
  }
  const downSince = prev.downSince ?? now
  if (prev.announced === "OK") return { state: { ...base, announced: "KO", downSince, lastAlertAt: now }, mail: "panne" }
  const lastAlert = Date.parse(prev.lastAlertAt ?? "")
  const due = !Number.isFinite(lastAlert) || Date.parse(now) - lastAlert >= reminderMs
  if (due) return { state: { ...base, downSince, lastAlertAt: now }, mail: "rappel" }
  return { state: { ...base, downSince }, mail: null }
}

/**
 * Etat a ecrire une fois l'e-mail tente. S'il n'est pas parti, on garde ce que
 * Tym sait (annonce, dernier e-mail) : la prochaine sonde le retentera. Pour un
 * retour rate, on garde aussi le debut de la panne, pour la duree du prochain.
 */
export function commitState(previous, decision, sent) {
  if (!decision.mail || sent) return decision.state
  const prev = normalizeState(previous)
  return {
    ...decision.state,
    announced: prev.announced,
    lastAlertAt: prev.lastAlertAt,
    downSince: decision.mail === "retour" ? prev.downSince : decision.state.downSince,
  }
}
