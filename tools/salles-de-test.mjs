// Les salles creees par un outil E2E (soiree.mjs, party-4-joueurs.mjs,
// anticheat-e2e.mjs) sont fermees quand il s'arrete.
//
// Pourquoi : une salle laissee en 'in_progress' (partie 2 coupee par la fin du
// script, script plante en route) passe pour une vraie partie aupres de
// scripts/attendre-parties.sh pendant 3 h et bloque les mises en prod
// (VLKAH9 le 31/10/2026, MAS2L3 le 30/10).
//
// Comment :
// - retenirSalle(code, hote) retient la salle, et la note dans un petit journal
//   sur disque (code:hote:pid) ;
// - a la sortie du processus (fin normale, process.exit, exception, Ctrl+C,
//   SIGTERM, SIGHUP), fermerSalles la passe en 'finished'. psql est synchrone
//   (execFileSync) : il tourne dans le crochet 'exit' ;
// - LIMITE : un SIGKILL (code 137, plafond memoire de heavy, kill -9) ne laisse
//   rien tourner. La salle reste ouverte, mais reste dans le journal : le
//   prochain outil E2E qui cree une salle sur la meme base la rattrape
//   (rattraperSalles), si le processus qui l'avait notee est bien mort.
//
// Gardes, partout : jamais une salle qu'on n'a pas creee. La requete exige le
// code ET host_user_id, et l'hote doit etre un joueur de test (invite cree
// depuis moins de FENETRE_HEURES dans la base visee). Un outil qui tourne plus
// longtemps que ca (ou une salle rattrapee plus tard) n'est pas fermee : le
// message le dit. Au-dela de 3 h, attendre-parties.sh ne la compte plus de
// toute facon.
import fs from "fs"
import path from "path"
import { psql, codeSalle, entier, verifierJoueursDeTest, SEED_PG } from "./seed-library.mjs"

// Plus que les 3 h que surveille attendre-parties.sh.
export const FENETRE_HEURES = 4

// Un journal par base visee : les ids des bases de dev et de prod ne se melangent pas.
const DOSSIER_JOURNAL = process.env.SALLES_JOURNAL_DIR || "/var/tmp/blindz-e2e"
export const journalParDefaut = () => path.join(DOSSIER_JOURNAL, `salles-${SEED_PG.container}-${SEED_PG.db}.txt`)

const salles = new Map() // code -> hote, pour CE processus
let crochetsPoses = false
let enSortie = false

/** Entrees du journal : { code, hote, pid }. Une ligne illisible est ignoree. */
export function lireJournal(fichier = journalParDefaut()) {
  let texte = ""
  try { texte = fs.readFileSync(fichier, "utf8") } catch { return [] }
  return texte.split("\n").map(l => l.trim().split(":")).filter(([code, hote, pid]) =>
    /^[A-Z0-9]{6}$/.test(code ?? "") && /^\d{1,10}$/.test(hote ?? "") && /^\d{1,10}$/.test(pid ?? ""),
  ).map(([code, hote, pid]) => ({ code, hote, pid: Number(pid) }))
}

function ecrireJournal(entrees, fichier) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true })
  fs.writeFileSync(fichier, entrees.map(e => `${e.code}:${e.hote}:${e.pid}\n`).join(""))
}

/** Retire du journal les entrees `retirer` (code + pid). */
function oublier(retirer, fichier) {
  const cles = new Set(retirer.map(e => `${e.code}:${e.pid}`))
  ecrireJournal(lireJournal(fichier).filter(e => !cles.has(`${e.code}:${e.pid}`)), fichier)
}

/** Vrai si le processus existe encore (meme d'un autre utilisateur). */
export function pidVivant(pid) {
  try { process.kill(pid, 0); return true } catch (e) { return e.code === "EPERM" }
}

/**
 * Passe en 'finished' les salles de `liste` (code -> hote) qui ne le sont pas
 * deja. Rend les codes fermes. Leve si un hote n'est pas un joueur de test :
 * rien n'est ecrit. `lire` : psql en vrai, une fausse base dans les tests.
 */
export function fermerSalles(lire = psql, liste = salles) {
  const hotes = verifierJoueursDeTest([...new Set(liste.values())], lire, { heures: FENETRE_HEURES })
  const fermees = []
  for (const [code, hote] of liste) {
    if (!hotes.includes(hote)) {
      console.error(`!! salle ${code} non fermee : hote ${hote} absent de la base ${SEED_PG.db} (salle d'une autre base ?)`)
      continue
    }
    const sortie = lire(`UPDATE multiplayer_rooms SET status='finished', completed_at=COALESCE(completed_at, NOW())
                         WHERE room_code='${codeSalle(code)}' AND host_user_id=${entier(hote)}
                           AND status IS DISTINCT FROM 'finished' RETURNING room_code`)
    if (sortie) fermees.push(...sortie.split("\n").filter(Boolean))
  }
  liste.clear()
  return fermees
}

/**
 * Ferme les salles du journal laissees par un outil mort sans fermer (SIGKILL).
 * Jamais celles d'un processus encore vivant : un autre outil peut jouer en ce
 * moment. Ne leve jamais : un rattrapage rate ne doit pas arreter l'outil qui
 * demarre. Rend les codes fermes.
 */
export function rattraperSalles({ lire = psql, fichier = journalParDefaut(), vivant = pidVivant } = {}) {
  const orphelines = lireJournal(fichier).filter(e => e.pid !== process.pid && !vivant(e.pid))
  if (!orphelines.length) return []
  const liste = new Map(orphelines.map(e => [e.code, e.hote]))
  try {
    const fermees = fermerSalles(lire, liste)
    if (fermees.length) console.log(`salle(s) laissee(s) par un outil arrete brutalement, fermee(s) : ${fermees.join(", ")}`)
    oublier(orphelines, fichier)
    return fermees
  } catch (e) {
    // Hote trop ancien ou vrai joueur : on ne peut rien prouver, on n'insiste pas.
    console.error(`!! salle(s) du journal NON fermee(s) (${orphelines.map(o => o.code).join(", ")}) : ${e.message} Retiree(s) du journal.`)
    oublier(orphelines, fichier)
    return []
  }
}

function poserCrochets(fichier) {
  crochetsPoses = true
  process.on("exit", () => {
    const miennes = [...salles.keys()].map(code => ({ code, pid: process.pid }))
    try {
      const fermees = fermerSalles()
      if (fermees.length) console.log(`salle(s) de test fermee(s) : ${fermees.join(", ")}`)
      oublier(miennes, fichier)
    } catch (e) {
      // Restent au journal : le prochain outil reessaiera.
      console.error(`!! salle(s) de test NON fermee(s) (${miennes.map(m => m.code).join(", ")}) : ${e.message}`)
    }
  })
  // Ctrl+C, arret par heavy ou systemd : sortir par 'exit'. Un deuxieme signal
  // pendant la fermeture est ignore (on, pas once : sinon il tuerait psql).
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      if (enSortie) return
      enSortie = true
      process.exit(130)
    })
  }
}

/**
 * Retient une salle que CE script vient de creer, pour la fermer a la sortie.
 * Rend le code, verifie par codeSalle (il finit dans une requete). Au premier
 * appel, rattrape d'abord les salles laissees par un outil tue (SIGKILL).
 */
export function retenirSalle(code, hoteId, fichier = journalParDefaut()) {
  const c = codeSalle(code)
  const h = entier(hoteId)
  if (!c || !h) {
    console.error(`!! salle non retenue (code ${c ?? "absent"}, hote ${h ?? "absent"}) : elle ne sera PAS fermee a la fin`)
    return c
  }
  if (!crochetsPoses) {
    rattraperSalles({ fichier })
    poserCrochets(fichier)
  }
  salles.set(c, String(h))
  try {
    fs.mkdirSync(path.dirname(fichier), { recursive: true })
    fs.appendFileSync(fichier, `${c}:${h}:${process.pid}\n`)
  } catch (e) {
    console.error(`!! journal des salles illisible (${e.message}) : un SIGKILL laisserait ${c} ouverte`)
  }
  return c
}
