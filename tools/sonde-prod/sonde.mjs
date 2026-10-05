#!/usr/bin/env node
// Sonde de prod de Blindz : un vrai « solo par lien » sur https://blindz.app,
// environ toutes les heures, et un e-mail a Tym quand ca casse.
//
// Pourquoi : le 02/10/2026, la recherche avancee de Deezer a casse chez eux et
// le solo par lien est reste en panne environ 2 h en prod (« Pas assez de
// titres avec extrait audio disponible »). Tym l'a vu lui-meme. La pile de test
// utilise un faux Deezer : elle ne peut pas voir ce genre de panne.
//
// Ce que fait chaque passage (checks.mjs), comme un joueur qui colle un lien :
//   1. GET /api/health (si l'API est par terre, on s'arrete : blindz-uptime previent deja) ;
//   2. GET /solo/ et le code du solo (nginx renvoie 200 meme pour une page inconnue) ;
//   3. pour une playlist Deezer publique (Top France) puis une playlist Spotify
//      publique (targets.mjs) : POST /api/quick-play {url, count: 10}, comme le
//      front ; il faut au moins 5 titres avec extrait, sinon pas de partie ;
//   4. le debut d'un extrait (8 Ko) : c'est bien du MP3, et la CSP de la page
//      laisse le navigateur le lire.
// Un lien en echec est retente une fois apres 60 s. En cas d'echec, un appel
// direct a l'API Deezer depuis le VPS aide a dire si c'est nous ou Deezer.
// Ni compte, ni salle, ni ecriture en base : /api/quick-play n'en cree pas. La
// sonde se presente avec le User-Agent « blindz-sonde-prod/1 ».
//
// Alertes (decision.mjs) : un e-mail quand ca casse, un rappel toutes les 6 h au
// plus tant que ca dure, un « c'est reparti » au retour. Cle Resend et
// destinataire : memes sources que blindz-uptime (mail.mjs), jamais dans le depot.
//
//   node tools/sonde-prod/sonde.mjs                 passage normal (minuteur systemd)
//   node tools/sonde-prod/sonde.mjs --dry-run       e-mail affiche, pas envoye ; etat non ecrit
//   node tools/sonde-prod/sonde.mjs --dry-run --only deezer --deezer https://www.deezer.com/fr/playlist/1
//                                                   panne forcee (playlist inexistante)
// Options : --state FICHIER, --log FICHIER (essais), --deezer URL, --spotify URL,
// --only deezer|spotify.
// Fichiers : etat /var/lib/blindz-sonde-prod/etat.json, journal (une ligne par
// passage) /var/log/blindz-sonde-prod/sonde.log.
// Sortie : 0 tout va bien, 1 la prod est en panne (l'e-mail s'en charge),
// 2 la sonde elle-meme a un probleme (options, disque).
//
// Charge : un passage = 2 lancements de solo, soit une trentaine d'appels a
// Deezer depuis le backend, comme deux joueurs. Pas plus : trop d'appels depuis
// le VPS font bloquer son adresse par Akamai, et ca touche tous les joueurs.
// Installation (GO de Tym) : tools/sonde-prod/installer.sh, unites dans infra/sonde-prod/.
import { parseArgs } from "node:util"
import { runProbe } from "./checks.mjs"
import { decide, commitState, INITIAL_STATE } from "./decision.mjs"
import { composeMail, formatLogLine, LOG_PATH } from "./message.mjs"
import { loadMailConfig, sendMail, previewMail } from "./mail.mjs"
import { loadState, saveState, appendLog, STATE_PATH } from "./storage.mjs"
import { buildTargets } from "./targets.mjs"

function readOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "dry-run": { type: "boolean", default: false },
      state: { type: "string" },
      log: { type: "string" },
      deezer: { type: "string" },
      spotify: { type: "string" },
      only: { type: "string" },
    },
  })
  return values
}

async function deliver(kind, run, previous, { dryRun, logPath }) {
  if (!kind) return { sent: false, outcome: "aucun" }
  const mail = composeMail(kind, run, previous, logPath)
  const config = loadMailConfig()
  if (dryRun) {
    console.log(previewMail(mail, config))
    return { sent: true, outcome: `${kind}:essai` }
  }
  const result = await sendMail({ config, mail })
  return { sent: result.sent, outcome: result.sent ? `${kind}:envoye` : `${kind}:echec(${result.detail})` }
}

function printRun(run) {
  for (const c of run.checks) {
    console.log(`  ${c.ok ? "[ok]" : "[KO]"} ${c.label}${c.ok ? "" : ` : ${c.detail}`}${c.attempts > 1 ? " (2 essais)" : ""}`)
  }
  if (run.deezerDiagnosis) console.log(`  Deezer en direct : ${run.deezerDiagnosis.detail}`)
}

async function main() {
  const options = readOptions(process.argv.slice(2))
  const targets = buildTargets(options)
  const dryRun = options["dry-run"]
  // En essai, l'etat et le journal du minuteur ne sont jamais touches, sauf fichiers donnes.
  const statePath = options.state ?? (dryRun ? null : STATE_PATH)
  const logPath = options.log ?? (dryRun ? null : LOG_PATH)

  const run = await runProbe({ targets })
  printRun(run)
  const { state: previous, warning } = statePath ? loadState(statePath) : { state: INITIAL_STATE, warning: null }
  if (warning) console.error(`sonde : ${warning}`)
  const decision = decide(previous, run.ok, run.at)
  const { sent, outcome } = await deliver(decision.mail, run, previous, { dryRun, logPath: logPath ?? LOG_PATH })
  const next = commitState(previous, decision, sent)
  const line = formatLogLine(run, next, outcome)
  console.log(line)
  if (statePath) saveState(statePath, next)
  if (logPath) appendLog(logPath, line)
  return run.ok ? 0 : 1
}

main().then(
  code => process.exit(code),
  err => {
    console.error(`sonde : ${err?.message ?? err}`)
    process.exit(2)
  },
)
