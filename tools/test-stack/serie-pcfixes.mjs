// Rejoue pcfixes-e2e.mjs --pile plusieurs fois de suite sur UNE pile, donc sur
// la meme base, et garde tout : la sortie complete de chaque passage, et entre
// deux passages ce que la base retient (a qui sont les titres du faux Deezer,
// ce que l'hote a recu a l'import, si sa partie a demarre).
//
// Pourquoi : "Correctifs PC" passait au rouge apres plusieurs campagnes sur la
// meme base (nuit du 02/10/2026) et restait vert sur base neuve. La campagne ne
// garde que les problemes, pas la sortie complete : la cause n'etait pas prouvee.
//
//   tools/test-stack/campagne-ref.sh <branche> --script /chemin/tools/test-stack/serie-pcfixes.mjs [--passages 6] [--out DOSSIER]
//
// Le script E2E lance est celui qui est a cote de ce fichier (../pcfixes-e2e.mjs),
// donc celui de la branche, pas celui du depot. Le dernier passage reprend le
// profil factice du premier : c'est le pire cas, ses 12 titres sont deja en base
// au nom de l'hote du premier passage.
//
// La base de test n'est que lue ici (le script E2E, lui, y ecrit comme toujours).
import fs from "node:fs"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { CONTAINER } from "./testdb.mjs"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, "..", "pcfixes-e2e.mjs")
const RUN = "/opt/blindify/.test-stack"
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const PASSAGES = Number(arg("--passages", "6"))
const OUT = path.resolve(arg("--out", path.join(RUN, "serie-pcfixes", new Date().toISOString().replace(/[:.]/g, "-"))))
if (!Number.isInteger(PASSAGES) || PASSAGES < 2) { console.error("--passages : au moins 2"); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })

const say = m => console.log(m)
const write = (name, text) => fs.writeFileSync(path.join(OUT, name), text.endsWith("\n") ? text : `${text}\n`)
// Lecture seule : la session psql refuse toute ecriture (et ne parle qu'a la base de test).
const lire = sql => execFileSync("docker", ["exec", "-e", "PGOPTIONS=-c default_transaction_read_only=on", CONTAINER,
  "psql", "-U", "blindify", "-d", "blindify_test", "-qAt", "-F", "|", "-c", sql], { maxBuffer: 16 * 1024 * 1024 }).toString().trim()

// Les titres du faux Deezer (proxy.mjs) : identifiants 900000 a 900047.
const FAUX_DEEZER = `a.provider = 'deezer' AND a.external_id ~ '^9000[0-4][0-9]$'`
const LIEN_PROFIL = `l.url LIKE '%deezer.com/profile/%'`

/** Ce que la base dit des titres du faux Deezer et des hotes de pcfixes. */
function etatBase() {
  const pris = lire(`SELECT count(*) FILTER (WHERE a.user_id IS NOT NULL), count(*) FROM audio_sources a WHERE ${FAUX_DEEZER}`).split("|")
  const proprios = lire(`SELECT coalesce(a.user_id::text, 'personne'), coalesce(u.username, ''), count(*),
      string_agg((a.external_id::int - 900000)::text, ' ' ORDER BY a.external_id::int)
    FROM audio_sources a LEFT JOIN users u ON u.id = a.user_id
    WHERE ${FAUX_DEEZER} GROUP BY 1, 2 ORDER BY min(a.created_at)`)
  return [
    `titres du faux Deezer en base : ${pris[1]} sur 48, dont ${pris[0]} a quelqu'un`,
    "proprietaire | pseudo | nombre | titres (k du catalogue)",
    proprios || "(aucun)",
    "",
    "hotes (lien de profil importe) | lien | carte active | titres a lui | dont sur cette carte | salles (code:statut:session:manches)",
    hotes(0).map(h => h.ligne).join("\n") || "(aucun)",
  ].join("\n")
}

/** Les hotes dont le lien de profil a un id > apres (un par passage). */
function hotes(apres) {
  return lire(`SELECT l.id, l.user_id, coalesce(u.username, ''), l.url, l.active::text,
      (SELECT count(*) FROM audio_sources s WHERE s.user_id = l.user_id),
      (SELECT count(*) FROM audio_sources s WHERE s.user_id = l.user_id AND s.link_id = l.id),
      coalesce((SELECT string_agg(m.room_code || ':' || coalesce(m.status, '?') || ':' || coalesce(m.session_id::text, '-')
          || ':' || coalesce(g.total_rounds::text, '-'), ' ' ORDER BY m.id)
        FROM multiplayer_rooms m LEFT JOIN game_sessions g ON g.id = m.session_id WHERE m.host_user_id = l.user_id), '')
    FROM imported_links l LEFT JOIN users u ON u.id = l.user_id
    WHERE ${LIEN_PROFIL} AND l.id > ${Number(apres)} ORDER BY l.id`).split("\n").filter(Boolean).map(r => {
    const [lienId, userId, pseudo, url, active, possedes, surCarte, salles] = r.split("|")
    return {
      lienId: Number(lienId), userId: Number(userId), possedes: Number(possedes), surCarte: Number(surCarte), salles,
      ligne: `${userId} ${pseudo} | lien ${lienId} ${url} | ${active} | ${possedes} | ${surCarte} | ${salles || "aucune"}`,
    }
  })
}

const dernierLien = () => Number(lire(`SELECT coalesce(max(l.id), 0) FROM imported_links l WHERE ${LIEN_PROFIL}`))
const taille = f => { try { return fs.statSync(f).size } catch { return 0 } }
const tranche = (f, depuis) => { try { return fs.readFileSync(f).subarray(depuis).toString() } catch { return "" } }
const BACKEND_LOG = `${RUN}/logs/backend.log`
const STUB_LOG = `${RUN}/logs/deezer-stub.log`

say(`serie de ${PASSAGES} passages de ${SCRIPT} --pile, sortie complete dans ${OUT}`)
write("base-0-avant.txt", etatBase())
const passages = []
for (let n = 1; n <= PASSAGES; n++) {
  const avant = { lien: dernierLien(), backend: taille(BACKEND_LOG), stub: taille(STUB_LOG) }
  const prisAvant = Number(lire(`SELECT count(*) FROM audio_sources a WHERE ${FAUX_DEEZER} AND a.user_id IS NOT NULL`))
  const env = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`, PCFIXES_SHOTS: path.join(OUT, "captures", `passage-${n}`) }
  if (n === PASSAGES && passages[0]?.profil) env.PCFIXES_PROFIL = String(passages[0].profil)
  else delete env.PCFIXES_PROFIL
  const t = Date.now()
  say(`\n===== passage ${n}/${PASSAGES}${env.PCFIXES_PROFIL ? ` (profil du passage 1 : ${env.PCFIXES_PROFIL})` : ""} =====`)
  const r = spawnSync(process.execPath, [SCRIPT, "--pile"], { cwd: path.dirname(SCRIPT), encoding: "utf8", timeout: 8 * 60 * 1000, env })
  const sortie = `${r.stdout ?? ""}${r.stderr ? `\n--- stderr ---\n${r.stderr}` : ""}${r.error ? `\n--- erreur ---\n${r.error.message}` : ""}`
  say(sortie.trimEnd())
  write(`passage-${n}.log`, sortie)
  write(`passage-${n}-backend.log`, tranche(BACKEND_LOG, avant.backend))
  write(`passage-${n}-faux-deezer.log`, tranche(STUB_LOG, avant.stub))
  const etat = etatBase()
  write(`base-${n}-apres.txt`, etat)

  const profil = Number((sortie.match(/profil factice (\d+)/) || [])[1]) || null
  const hote = hotes(avant.lien)[0] ?? null
  const p = {
    n, profil, debut: profil == null ? null : profil % 48, prisAvant, hote,
    lancement: (sortie.match(/lancement : (.*)/) || [])[1] ?? "pas de reponse vue",
    code: r.status, duree: Math.round((Date.now() - t) / 1000),
    problemes: sortie.split("\n").filter(l => /^\s*!!/.test(l)).map(l => l.replace(/^\s*!!\s*/, "")),
  }
  passages.push(p)
  say(`--- base apres le passage ${n} ---\n${etat}`)
}

const lignes = [
  `serie pcfixes --pile, ${PASSAGES} passages sur la meme base (${new Date().toISOString()})`,
  `commit teste : ${fs.existsSync(`${RUN}/front.commit`) ? fs.readFileSync(`${RUN}/front.commit`, "utf8").split(" ")[0] : "?"}`,
  "",
  "passage | profil (titres k) | titres du faux Deezer deja pris avant | titres recus par l'hote | lancement | salle | resultat",
  ...passages.map(p => {
    const fenetre = p.debut == null ? "?" : `${p.debut}..${(p.debut + 11) % 48}`
    const res = p.code === 0 ? "VERT" : `ROUGE (code ${p.code}) : ${p.problemes.join(" ; ") || "voir la sortie"}`
    return `${p.n} | ${p.profil ?? "?"} (${fenetre}) | ${p.prisAvant}/48 | ${p.hote ? `${p.hote.surCarte}/12` : "?"} | ${p.lancement} | ${p.hote?.salles || "?"} | ${res} (${p.duree} s)`
  }),
]
const rouges = passages.filter(p => p.code !== 0).length
lignes.push("", rouges ? `${rouges} PASSAGE(S) ROUGE(S) SUR ${PASSAGES}` : `${PASSAGES} PASSAGES VERTS SUR ${PASSAGES}`)
write("resume.txt", lignes.join("\n"))
say(`\n${lignes.join("\n")}`)
process.exit(rouges ? 1 : 0)
