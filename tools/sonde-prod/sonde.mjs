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
// Sortie : 0 tout va bien, 1 la prod est en panne (l'e-mail est parti),
// 2 la sonde elle-meme a un probleme (options, disque, cle Resend ou
// destinataire absent, e-mail du qui n'a pas pu partir) : l'unite systemd
// passe alors en echec (systemctl --failed).
//
// Charge : un passage = 2 lancements de solo, soit une trentaine d'appels a
// Deezer depuis le backend, comme deux joueurs. Pas plus : trop d'appels depuis
// le VPS font bloquer son adresse par Akamai, et ca touche tous les joueurs.
// Installation (GO de Tym) : tools/sonde-prod/installer.sh, unites dans infra/sonde-prod/.
import { parseArgs } from "node:util"
import { runOnce } from "./passage.mjs"
import { LOG_PATH } from "./message.mjs"
import { STATE_PATH } from "./storage.mjs"
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

async function main() {
  const options = readOptions(process.argv.slice(2))
  const dryRun = options["dry-run"]
  const { ok, mailFailed } = await runOnce({
    targets: buildTargets(options),
    dryRun,
    // En essai, l'etat et le journal du minuteur ne sont jamais touches, sauf fichiers donnes.
    statePath: options.state ?? (dryRun ? null : STATE_PATH),
    logPath: options.log ?? (dryRun ? null : LOG_PATH),
  })
  if (mailFailed) return 2
  return ok ? 0 : 1
}

main().then(
  code => process.exit(code),
  err => {
    console.error(`sonde : ${err?.message ?? err}`)
    process.exit(2)
  },
)
