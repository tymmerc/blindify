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
//   1. GET /api/health (si l'API reste par terre, on s'arrete : blindz-uptime previent aussi) ;
//   2. GET /solo/ et le code du solo (nginx renvoie 200 meme pour une page inconnue) ;
//   3. pour une playlist Deezer publique (Top France) puis une playlist Spotify
//      publique (targets.mjs) : POST /api/quick-play {url, count: 10}, comme le
//      front ; il faut au moins 5 titres avec extrait, sinon pas de partie ;
//   4. le debut d'un extrait (8 Ko) : c'est bien du MP3, et la CSP de la page
//      laisse le navigateur le lire.
// Chaque verification en echec (API, page, lien) est refaite une fois apres
// 60 s : un delai depasse ou nginx recharge pendant un deploiement ne donne pas
// d'alerte. En cas d'echec, un appel direct a l'API Deezer depuis le VPS aide a
// dire si c'est nous ou Deezer.
// Ni compte, ni salle, ni ecriture en base : /api/quick-play n'en cree pas. La
// sonde se presente avec le User-Agent « blindz-sonde-prod/1 ».
//
// Alertes (decision.mjs) : un e-mail quand ca casse, un rappel environ toutes
// les 6 h tant que ca dure, un « c'est reparti » au retour. Destinataire,
// expediteur et fichier de la cle Resend : ALERTE_DESTINATAIRE,
// ALERTE_EXPEDITEUR et RESEND_CLE_FICHIER, en variable d'environnement ou dans
// alerte.env hors du depot (detail dans mail.mjs), jamais dans le depot.
//
//   node tools/sonde-prod/sonde.mjs                 passage normal (minuteur systemd)
//   node tools/sonde-prod/sonde.mjs --dry-run       e-mail affiche, pas envoye ; etat non ecrit
//   node tools/sonde-prod/sonde.mjs --dry-run --only deezer --deezer https://www.deezer.com/fr/playlist/1
//                                                   panne forcee (playlist inexistante)
//   node tools/sonde-prod/sonde.mjs --verifier-config  config d'envoi complete ? (sans reseau)
// Options : --state FICHIER, --log FICHIER (essais), --deezer URL, --spotify URL,
// --only deezer|spotify.
// Fichiers : etat /var/lib/blindz-sonde-prod/etat.json, journal (une ligne par
// passage) /var/log/blindz-sonde-prod/sonde.log.
// Sortie (EXIT dans passage.mjs) : 0 tout va bien, 10 la prod est en panne
// (l'e-mail est parti, ou n'etait pas du), 2 la sonde elle-meme a un probleme
// (options, disque, config d'envoi incomplete, e-mail du qui n'a pas pu partir).
// 1 reste le code de Node pour une erreur fatale (module absent...). L'unite
// systemd n'accepte que 0 et 10 : avec 1 ou 2 elle passe en echec
// (systemctl --failed) et blindz-sonde-prod-echec.service previent par ntfy.
//
// Charge : un passage = 2 lancements de solo, soit une trentaine d'appels a
// Deezer depuis le backend, comme deux joueurs. Pas plus : trop d'appels depuis
// le VPS font bloquer son adresse par Akamai, et ca touche tous les joueurs.
// Installation (GO de Tym) : tools/sonde-prod/installer.sh, unites dans infra/sonde-prod/.
import { parseArgs } from "node:util"
import { runOnce, exitCode, EXIT } from "./passage.mjs"
import { LOG_PATH } from "./message.mjs"
import { loadMailConfig } from "./mail.mjs"
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
      "verifier-config": { type: "boolean", default: false },
    },
  })
  return values
}

/** Pour l'installeur : la config d'envoi est-elle complete ? Jamais les valeurs. */
function checkConfig() {
  const { missing } = loadMailConfig()
  if (missing.length === 0) {
    console.log("config d'envoi complète (destinataire, expéditeur, clé Resend)")
    return EXIT.OK
  }
  console.error(`config d'envoi incomplète : ${missing.join(", ")}`)
  return EXIT.SONDE
}

async function main() {
  const options = readOptions(process.argv.slice(2))
  if (options["verifier-config"]) return checkConfig()
  const dryRun = options["dry-run"]
  const result = await runOnce({
    targets: buildTargets(options),
    dryRun,
    // En essai, l'etat et le journal du minuteur ne sont jamais touches, sauf fichiers donnes.
    statePath: options.state ?? (dryRun ? null : STATE_PATH),
    logPath: options.log ?? (dryRun ? null : LOG_PATH),
  })
  return exitCode(result)
}

main().then(
  code => process.exit(code),
  err => {
    console.error(`sonde : ${err?.message ?? err}`)
    process.exit(EXIT.SONDE)
  },
)
