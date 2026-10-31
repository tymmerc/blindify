// Les salles creees par un outil E2E (soiree.mjs, party-4-joueurs.mjs,
// anticheat-e2e.mjs) sont fermees quand il s'arrete.
//
// Pourquoi : une salle laissee en 'in_progress' (partie 2 coupee par la fin du
// script, script plante en route) passe pour une vraie partie aupres de
// scripts/attendre-parties.sh pendant 3 h et bloque les mises en prod
// (VLKAH9 le 31/10/2026, MAS2L3 le 30/10).
//
// Comment :
// - retenirSalle(code, hote) retient la salle, et la note dans le journal de
//   CE processus : un fichier par processus et par base,
//   <dossier>/salles-<conteneur>-<base>-<pid>.txt (lignes code:hote) ;
// - a la sortie du processus (fin normale, process.exit, exception, Ctrl+C,
//   SIGTERM, SIGHUP), chaque salle est passee en 'finished', une par une. psql
//   est synchrone (execFileSync, borne a 10 s) : il tourne dans le crochet
//   'exit'. Le fichier du processus est alors supprime, sauf pour les salles
//   qui n'ont pas pu etre fermees a cause d'une panne passagere ;
// - LIMITE : un SIGKILL (code 137, plafond memoire de heavy, kill -9) ne laisse
//   rien tourner. La salle reste ouverte, mais son fichier reste : le prochain
//   outil E2E qui cree une salle sur la meme base lit les fichiers des
//   processus morts (jamais des vivants) et les rattrape.
//
// Ce qui sort d'un journal : une salle fermee (ou deja finie), une salle dont
// l'hote est absent de la base visee, une salle dont l'hote est prouve trop
// ancien ou n'est pas un joueur de test. Une panne de docker ou de psql la
// laisse dans le journal, pour le prochain essai. Un journal de plus de 4 h
// est supprime sans fermer (attendre-parties.sh ne compte plus ces salles).
// Chaque abandon est ecrit sur stderr.
//
// Le rattrapage est borne : 30 s en tout, et arret a la premiere panne ; le
// reste attend l'outil suivant. Un journal deja present au pid de l'outil qui
// demarre vient d'un ancien outil tue (pid recycle) : il est traite comme
// celui d'un mort, puis l'outil repart d'un fichier neuf.
//
// Gardes, partout : jamais une salle qu'on n'a pas creee. La requete exige le
// code ET host_user_id, et l'hote doit etre un joueur de test (invite cree
// depuis moins de FENETRE_HEURES dans la base visee). Au-dela de 3 h,
// attendre-parties.sh ne compte plus la salle de toute facon. Le dossier du
// journal est en 0700, a l'utilisateur courant, et ni lui ni les fichiers ne
// peuvent etre des liens symboliques ; sinon l'outil continue sans journal.
import fs from "fs"
import path from "path"
import { psqlBorne, codeSalle, entier, verifierJoueursDeTest, PasJoueurDeTest, SEED_PG } from "./seed-library.mjs"

// Plus que les 3 h que surveille attendre-parties.sh.
export const FENETRE_HEURES = 4
// Rattrapage au demarrage d'un outil : docker bloque ne doit pas le retenir
// des minutes (jusqu'a 2 requetes de 10 s par salle).
export const BUDGET_RATTRAPAGE_MS = 30_000
// Journal d'un processus mort plus vieux que ca : supprime sans fermer.
// attendre-parties.sh ne compte plus ces salles (3 h), et une panne qui dure
// ne doit pas faire retenter une entree pour toujours.
export const PEREMPTION_MS = FENETRE_HEURES * 3600 * 1000
// Code de sortie par signal (128 + numero du signal).
const SIGNAUX = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }

const dossierParDefaut = () => process.env.SALLES_JOURNAL_DIR || "/var/tmp/blindz-e2e"
const prefixe = () => `salles-${SEED_PG.container}-${SEED_PG.db}-`
const enRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
export const journalDe = (pid, dossier) => path.join(dossier, `${prefixe()}${pid}.txt`)

const salles = new Map() // code -> hote, pour CE processus
let heritees = [] // salles d'un ancien outil au meme pid, en panne a la reprise
let monJournal = null
let crochetsPoses = false
let enSortie = false

const premiereLigne = e => String(e?.message ?? e).split("\n")[0]

/** Le dossier du journal, cree en 0700 : rend son chemin, ou null (avec un message) s'il n'est pas sur. */
export function dossierSur(dossier = dossierParDefaut()) {
  try {
    fs.mkdirSync(dossier, { recursive: true, mode: 0o700 })
    const st = fs.lstatSync(dossier)
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error("ce n'est pas un vrai dossier")
    if (st.uid !== process.getuid()) throw new Error(`il appartient a l'uid ${st.uid}`)
    if ((st.mode & 0o077) !== 0) fs.chmodSync(dossier, 0o700)
    return dossier
  } catch (e) {
    console.error(`!! journal des salles refuse (${dossier} : ${premiereLigne(e)}) : un SIGKILL laisserait la salle ouverte`)
    return null
  }
}

/** Faux si le fichier n'est pas un fichier ordinaire a nous (lien symbolique compris). */
const aNous = st => st.isFile() && !st.isSymbolicLink() && st.uid === process.getuid()

/** Les entrees { code, hote } d'un journal. Une ligne illisible est ignoree. */
export function lireJournal(fichier) {
  let texte = ""
  try {
    if (!aNous(fs.lstatSync(fichier))) throw new Error("pas un fichier a nous")
    texte = fs.readFileSync(fichier, "utf8")
  } catch (e) {
    if (e.code === "ENOENT") return []
    throw e
  }
  return texte.split("\n").map(l => l.trim().split(":"))
    .filter(([code, hote]) => /^[A-Z0-9]{6}$/.test(code ?? "") && /^\d{1,10}$/.test(hote ?? ""))
    .map(([code, hote]) => ({ code, hote }))
}

/** Ecrit `texte` dans `fichier` sans jamais suivre un lien, en 0600. */
function ecrire(fichier, texte, drapeaux) {
  const fd = fs.openSync(fichier, drapeaux | fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600)
  try {
    if (!aNous(fs.fstatSync(fd))) throw new Error("pas un fichier a nous")
    fs.writeSync(fd, texte)
  } finally {
    fs.closeSync(fd)
  }
}

/** Le journal ne garde que `entrees` ; vide, il est supprime. */
function reecrire(fichier, entrees) {
  if (!entrees.length) {
    try { fs.unlinkSync(fichier) } catch (e) { if (e.code !== "ENOENT") throw e }
    return
  }
  ecrire(fichier, entrees.map(e => `${e.code}:${e.hote}\n`).join(""), fs.constants.O_TRUNC)
}

/** Vrai si le processus existe encore (meme d'un autre utilisateur). */
export function pidVivant(pid) {
  try { process.kill(pid, 0); return true } catch (e) { return e.code === "EPERM" }
}

/**
 * Ferme UNE salle. Ne leve jamais. Rend :
 * - "fermee" : passee en 'finished' ;
 * - "rien" : deja finie (ou pas a cet hote : la requete ne touche rien) ;
 * - "absent" : hote absent de la base visee (salle d'une autre base) ;
 * - "refuse" : hote prouve trop ancien, ou pas un joueur de test ;
 * - "erreur" : panne passagere (docker, psql, delai) : a garder.
 */
export function fermerUne(code, hote, lire = psqlBorne) {
  try {
    const hotes = verifierJoueursDeTest([hote], lire, { heures: FENETRE_HEURES })
    if (!hotes.length) {
      console.error(`!! salle ${code} non fermee : hote ${hote} absent de la base ${SEED_PG.db} (salle d'une autre base ?)`)
      return "absent"
    }
    const sortie = lire(`UPDATE multiplayer_rooms SET status='finished', completed_at=COALESCE(completed_at, NOW())
                         WHERE room_code='${codeSalle(code)}' AND host_user_id=${entier(hote)}
                           AND status IS DISTINCT FROM 'finished' RETURNING room_code`)
    return String(sortie ?? "").trim() ? "fermee" : "rien"
  } catch (e) {
    if (e instanceof PasJoueurDeTest) {
      console.error(`!! salle ${code} non fermee : ${premiereLigne(e)}`)
      return "refuse"
    }
    console.error(`!! salle ${code} non fermee, panne passagere (${premiereLigne(e)}) : gardee pour le prochain outil`)
    return "erreur"
  }
}

/**
 * Ferme un lot, salle par salle. `aGarder` : les entrees en panne passagere,
 * et celles qu'on n'a pas eu le temps de traiter. Options du rattrapage :
 * `jusqua` (heure limite, selon `horloge`) et `arreterSurErreur` (docker en
 * panne : inutile d'attendre 10 s de plus par salle). `interrompu` : on s'est
 * arrete avant la fin.
 */
export function fermerLot(entrees, lire = psqlBorne, { jusqua = Infinity, horloge = Date.now, arreterSurErreur = false } = {}) {
  const fermees = []
  const aGarder = []
  let interrompu = false
  for (const entree of entrees) {
    if (interrompu || horloge() >= jusqua) {
      interrompu = true
      aGarder.push(entree)
      continue
    }
    const sort = fermerUne(entree.code, entree.hote, lire)
    if (sort === "fermee") fermees.push(entree.code)
    else if (sort === "erreur") {
      aGarder.push(entree)
      if (arreterSurErreur) interrompu = true
    }
  }
  return { fermees, aGarder, interrompu }
}

/**
 * Traite le journal d'un processus qui n'est plus la (mort, ou pid recycle).
 * Plus vieux que PEREMPTION_MS : supprime sans rien fermer, avec un message
 * (attendre-parties.sh ne compte plus ces salles). Sinon : fermerLot, borne.
 */
function traiterJournalMort(fichier, { lire, jusqua, horloge }) {
  const st = fs.lstatSync(fichier)
  if (!aNous(st)) throw new Error("pas un fichier a nous")
  const entrees = lireJournal(fichier)
  if (horloge() - st.mtimeMs > PEREMPTION_MS) {
    console.error(`!! journal ${path.basename(fichier)} perime (plus de ${FENETRE_HEURES} h) : supprime, salle(s) ${entrees.map(e => e.code).join(", ") || "aucune"} non fermee(s)`)
    return { fermees: [], aGarder: [], interrompu: false }
  }
  return fermerLot(entrees, lire, { jusqua, horloge, arreterSurErreur: true })
}

/**
 * Rattrape les salles laissees par des outils morts sans fermer (SIGKILL) :
 * les fichiers des processus morts, jamais des vivants. Borne : budgetMs au
 * total, et arret a la premiere panne ; le reste attend le prochain outil.
 * Ne leve jamais : un rattrapage rate ne doit pas arreter l'outil qui demarre.
 * Rend les codes fermes.
 */
export function rattraperSalles({
  lire = psqlBorne, dossier = dossierParDefaut(), vivant = pidVivant,
  horloge = Date.now, budgetMs = BUDGET_RATTRAPAGE_MS, jusqua = horloge() + budgetMs,
} = {}) {
  const fermees = []
  let interrompu = false
  try {
    const sur = dossierSur(dossier)
    if (!sur) return fermees
    const motif = new RegExp(`^${enRegex(prefixe())}(\\d{1,10})\\.txt$`)
    for (const nom of fs.readdirSync(sur)) {
      const pid = Number(nom.match(motif)?.[1])
      if (!pid || pid === process.pid || vivant(pid)) continue
      if (interrompu) continue // reste tel quel pour le prochain outil
      const fichier = path.join(sur, nom)
      try {
        const lot = traiterJournalMort(fichier, { lire, jusqua, horloge })
        fermees.push(...lot.fermees)
        interrompu = lot.interrompu
        try {
          reecrire(fichier, lot.aGarder)
        } catch (e) {
          console.error(`!! journal ${nom} non mis a jour (${premiereLigne(e)}) : ses salles seront revues au prochain outil`)
        }
      } catch (e) {
        console.error(`!! journal ${nom} ignore (${premiereLigne(e)})`)
      }
    }
  } catch (e) {
    console.error(`!! rattrapage des salles impossible (${premiereLigne(e)})`)
  }
  if (interrompu) console.error(`!! rattrapage arrete (panne, ou budget de ${Math.round(budgetMs / 1000)} s ecoule) : le reste attend le prochain outil`)
  if (fermees.length) console.log(`salle(s) laissee(s) par un outil arrete brutalement, fermee(s) : ${fermees.join(", ")}`)
  return fermees
}

/**
 * Ouvre le journal de CE processus. S'il existe deja, il vient d'un ancien
 * outil tue qui avait le meme pid (pid recycle) : ses salles sont traitees
 * comme celles d'un mort, puis on repart d'un fichier neuf (O_EXCL). Rend
 * { fichier, heritees } : le journal (null si impossible, avec un message) et
 * les salles heritees en panne, a refermer a la sortie de ce processus.
 */
export function ouvrirMonJournal(fichier, { lire = psqlBorne, horloge = Date.now, jusqua = horloge() + BUDGET_RATTRAPAGE_MS } = {}) {
  let heritees = []
  try {
    let existe = true
    try { fs.lstatSync(fichier) } catch (e) { if (e.code === "ENOENT") existe = false; else throw e }
    if (existe) {
      const lot = traiterJournalMort(fichier, { lire, jusqua, horloge })
      heritees = lot.aGarder
      if (lot.fermees.length) console.log(`salle(s) d'un ancien outil au meme pid, fermee(s) : ${lot.fermees.join(", ")}`)
      fs.unlinkSync(fichier)
    }
    ecrire(fichier, heritees.map(e => `${e.code}:${e.hote}\n`).join(""), fs.constants.O_EXCL)
    return { fichier, heritees }
  } catch (e) {
    console.error(`!! journal ${fichier} impossible (${premiereLigne(e)}) : un SIGKILL laisserait la salle ouverte`)
    return { fichier: null, heritees }
  }
}

function poserCrochets() {
  crochetsPoses = true
  process.on("exit", () => {
    const entrees = [...[...salles].map(([code, hote]) => ({ code, hote })), ...heritees]
    salles.clear()
    heritees = []
    const { fermees, aGarder } = fermerLot(entrees)
    if (fermees.length) console.log(`salle(s) de test fermee(s) : ${fermees.join(", ")}`)
    if (!monJournal) return
    try {
      reecrire(monJournal, aGarder)
    } catch (e) {
      // La fermeture, elle, a eu lieu (ou pas) comme dit au-dessus.
      console.error(`!! journal ${monJournal} non mis a jour (${premiereLigne(e)}) : le prochain outil reverra ces salles, sans effet sur celles deja fermees`)
    }
  })
  // Ctrl+C, arret par heavy ou systemd : sortir par 'exit'. Un deuxieme signal
  // pendant la fermeture est ignore (on, pas once : sinon il tuerait psql).
  for (const [signal, code] of Object.entries(SIGNAUX)) {
    process.on(signal, () => {
      if (enSortie) return
      enSortie = true
      process.exit(code)
    })
  }
}

/**
 * Retient une salle que CE script vient de creer, pour la fermer a la sortie.
 * Rend le code, verifie par codeSalle (il finit dans une requete). Au premier
 * appel, rattrape d'abord les salles laissees par un outil tue (SIGKILL).
 * Ne leve que pour un code ou un id mal formes : aucun souci de journal ne
 * fait planter l'outil.
 */
export function retenirSalle(code, hoteId, { dossier = dossierParDefaut() } = {}) {
  const c = codeSalle(code)
  const h = entier(hoteId)
  if (!c || !h) {
    console.error(`!! salle non retenue (code ${c ?? "absent"}, hote ${h ?? "absent"}) : elle ne sera PAS fermee a la fin`)
    return c
  }
  if (!crochetsPoses) {
    const sur = dossierSur(dossier)
    if (sur) {
      const jusqua = Date.now() + BUDGET_RATTRAPAGE_MS // un seul budget pour les deux
      rattraperSalles({ dossier: sur, jusqua })
      const ouvert = ouvrirMonJournal(journalDe(process.pid, sur), { jusqua })
      monJournal = ouvert.fichier
      heritees = ouvert.heritees
    }
    poserCrochets()
  }
  salles.set(c, String(h))
  if (monJournal) {
    try {
      ecrire(monJournal, `${c}:${h}\n`, fs.constants.O_APPEND)
    } catch (e) {
      console.error(`!! journal ${monJournal} illisible (${premiereLigne(e)}) : un SIGKILL laisserait ${c} ouverte`)
    }
  }
  return c
}
