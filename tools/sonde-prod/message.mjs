// Ce que la sonde ecrit : l'e-mail a Tym (panne, rappel, retour) et la ligne
// du journal. Fonctions pures, testees par message.test.mjs.
//
// Une sonde (run, voir checks.mjs) ressemble a :
//   { ok, at, durationMs, checks: [{ id, label, ok, suspect, detail, code,
//     http, tracks, ms, attempts, url }], deezerDiagnosis: { status, detail } | null }
// suspect : qui est probablement en cause quand la verification echoue
// ("app" = blindz.app, "deezer", "spotify").

export const LOG_PATH = "/var/log/blindz-sonde-prod/sonde.log"
const BASE = "https://blindz.app"

const PARIS = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
})

/** « 05/10 à 02:12 », heure de Paris (l'horloge du VPS est en UTC). */
export function parisTime(iso) {
  const p = Object.fromEntries(PARIS.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return `${p.day}/${p.month} à ${p.hour}:${p.minute}`
}

/** « 2 h 05 », « 45 min » : la duree d'une panne, lisible. */
export function formatDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`
}

const failing = run => run.checks.filter(c => !c.ok)

/** Phrase sur l'origine probable de la panne, a partir des echecs et du diagnostic Deezer. */
export function cause(run) {
  const ko = failing(run)
  if (ko.length === 0) return { side: "aucun", text: "Tout passe." }
  const app = ko.find(c => c.suspect === "app")
  if (app) return { side: "app", text: `Ça ressemble à un souci chez nous (blindz.app) : ${app.label}, ${app.detail}.` }
  const diag = run.deezerDiagnosis
  if (diag?.status === "blocked") {
    return { side: "deezer", text: "Deezer bloque l'adresse du VPS (Access Denied d'Akamai) : le backend ne peut plus rien lui demander et tous les joueurs sont touchés. Ça arrive après trop d'appels depuis le VPS (des tests ?) et ça se lève en général seul en quelques heures." }
  }
  const sides = new Set(ko.map(c => c.suspect))
  if (sides.size === 1 && sides.has("spotify")) {
    return { side: "spotify", text: "Ça ressemble à Spotify (son API, ou la playlist a changé) : la partie Deezer, elle, passe." }
  }
  if (diag && diag.status !== "ok") return { side: "deezer", text: `Ça ressemble à Deezer : en direct depuis le VPS, ${diag.detail}.` }
  if (diag?.status === "ok" && ko.some(c => c.code === "insufficient_tracks")) {
    return { side: "app", text: "Deezer répond normalement en direct, mais l'app ne trouve plus d'extraits : sans doute un changement chez Deezer que notre recherche ne suit plus (comme le 02/10), donc à corriger chez nous (deezerPreviewService)." }
  }
  return { side: "deezer", text: "Ça ressemble à Deezer ou Spotify plutôt qu'à notre code, sans certitude : voir le détail." }
}

function checkLine(c) {
  if (!c.ok) return `- ${c.label} : en échec, ${c.detail}`
  const extra = c.tracks != null ? `, ${c.tracks} titres jouables en ${(c.ms / 1000).toFixed(1)} s` : ""
  const retry = c.attempts > 1 ? " (au 2e essai)" : ""
  return `- ${c.label} : ok${extra}${retry}`
}

const details = run => run.checks.map(checkLine).join("\n")

/** La commande pour rejouer a la main la premiere verification de lien en echec. */
function replayCommand(run) {
  const target = failing(run).find(c => c.url) ?? run.checks.find(c => c.url)
  if (!target) return `curl -s ${BASE}/api/health`
  const body = JSON.stringify({ url: target.url, count: 10 })
  return `curl -s -X POST ${BASE}/api/quick-play -H 'Content-Type: application/json' -H 'Origin: ${BASE}' -d '${body}'`
}

/**
 * L'e-mail a envoyer. type : "panne" | "rappel" | "retour".
 * previous : l'etat d'avant la sonde (debut de la panne pour le retour).
 */
export function composeMail(type, run, previous, logPath = LOG_PATH) {
  const at = parisTime(run.at)
  const footer = `Journal de la sonde : ${logPath}`
  if (type === "retour") {
    const since = previous?.downSince
    const length = since ? ` La panne a duré environ ${formatDuration(Date.parse(run.at) - Date.parse(since))} (première sonde en échec le ${parisTime(since)}).` : ""
    return {
      subject: "[Blindz] C'est reparti : le solo par lien remarche",
      text: `La sonde a relancé un solo par lien sur blindz.app sans souci le ${at}.${length}\n\n${details(run)}\n\n${footer}`,
    }
  }
  const why = cause(run).text
  const replay = `Pour rejouer la même chose à la main :\n${replayCommand(run)}`
  if (type === "rappel") {
    const since = previous?.downSince ?? run.at
    return {
      subject: `[Blindz] Le solo par lien est toujours en panne (depuis ${formatDuration(Date.parse(run.at) - Date.parse(since))})`,
      text: `Toujours en panne : première sonde en échec le ${parisTime(since)}, dernier essai le ${at}.\n\n${why}\n\n${details(run)}\n\n${replay}\n\nProchain rappel dans 6 h si ça ne revient pas.\n${footer}`,
    }
  }
  return {
    subject: "[Blindz] Le solo par lien ne marche plus sur blindz.app",
    text: `La sonde n'arrive plus à lancer un solo par lien sur blindz.app (le ${at}, deux essais à une minute d'écart).\n\n${why}\n\n${details(run)}\n\n${replay}\n\nJe te renvoie un mail toutes les 6 h tant que ça ne revient pas, et un dernier quand c'est reparti.\n${footer}`,
  }
}

function logField(c) {
  if (c.ok) return c.tracks != null ? `${c.id}=ok[${c.tracks} titres;${(c.ms / 1000).toFixed(1)}s${c.attempts > 1 ? ";2e essai" : ""}]` : `${c.id}=ok`
  const parts = [c.code ?? "echec", c.http ? `HTTP ${c.http}` : null, c.tracks != null ? `${c.tracks} titres` : null, `suspect=${c.suspect ?? "?"}`]
  return `${c.id}=KO[${parts.filter(Boolean).join(";")}]`
}

/** Une ligne par sonde, sans adresse e-mail ni secret. mailOutcome : "aucun", "panne:envoye"... */
export function formatLogLine(run, state, mailOutcome) {
  const fields = [
    run.at.replace(/\.\d{3}Z$/, "Z"),
    `etat=${run.ok ? "OK" : "KO"}`,
    `annonce=${state.announced}`,
    ...run.checks.map(logField),
    run.ok ? null : `cause=${cause(run).side}`,
    run.deezerDiagnosis ? `deezer_direct=${run.deezerDiagnosis.status}` : null,
    `mail=${mailOutcome}`,
    `duree=${Math.round(run.durationMs / 1000)}s`,
  ]
  return fields.filter(Boolean).join(" ")
}
