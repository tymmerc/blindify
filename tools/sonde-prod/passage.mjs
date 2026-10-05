// Un passage de la sonde, de bout en bout : verifications, decision, e-mail,
// etat et journal. Le reseau, les fichiers de config et l'affichage sont
// injectables : passage.test.mjs joue une panne complete sans rien envoyer.
import { runProbe } from "./checks.mjs"
import { decide, commitState, INITIAL_STATE } from "./decision.mjs"
import { composeMail, formatLogLine, LOG_PATH } from "./message.mjs"
import { loadMailConfig, sendMail, previewMail } from "./mail.mjs"
import { loadState, saveState, appendLog } from "./storage.mjs"

async function deliver(kind, run, previous, opts) {
  if (!kind) return { sent: false, outcome: "aucun" }
  const mail = composeMail(kind, run, previous, opts.logPath ?? LOG_PATH)
  const config = opts.loadConfig()
  if (opts.dryRun) {
    opts.print(previewMail(mail, config))
    return { sent: true, outcome: `${kind}:essai` }
  }
  const result = await sendMail({ fetchFn: opts.fetchFn, config, mail })
  return { sent: result.sent, outcome: result.sent ? `${kind}:envoye` : `${kind}:echec(${result.detail})` }
}

function printRun(run, print) {
  for (const c of run.checks) {
    print(`  ${c.ok ? "[ok]" : "[KO]"} ${c.label}${c.ok ? "" : ` : ${c.detail}`}${c.attempts > 1 ? " (2 essais)" : ""}`)
  }
  if (run.deezerDiagnosis) print(`  Deezer en direct : ${run.deezerDiagnosis.detail}`)
}

/**
 * statePath / logPath a null : rien n'est lu ni ecrit (mode essai sans fichier).
 * Renvoie { ok, mail, line } : ok pour le code de sortie, mail = issue de l'e-mail.
 */
export async function runOnce({
  targets, statePath, logPath, dryRun = false, fetchFn = fetch, sleep, pauseMs,
  loadConfig = loadMailConfig, print = console.log, warn = console.error,
}) {
  const run = await runProbe({ fetchFn, targets, sleep, pauseMs })
  printRun(run, print)
  const { state: previous, warning } = statePath ? loadState(statePath) : { state: INITIAL_STATE, warning: null }
  if (warning) warn(`sonde : ${warning}`)
  const decision = decide(previous, run.ok, run.at)
  const { sent, outcome } = await deliver(decision.mail, run, previous, { dryRun, logPath, fetchFn, loadConfig, print })
  const next = commitState(previous, decision, sent)
  const line = formatLogLine(run, next, outcome)
  print(line)
  if (statePath) saveState(statePath, next)
  if (logPath) appendLog(logPath, line)
  return { ok: run.ok, mail: outcome, line }
}
