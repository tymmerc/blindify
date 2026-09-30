// Le catalogue musical de la pile de test : 48 "morceaux" synthetiques.
//
// Chaque morceau est un son pur de 30 s a une frequence qui lui est propre.
// Pourquoi pas de vrais extraits : (1) aucun appel Deezer, (2) pas de droits,
// (3) surtout, la sonde audio du navigateur peut dire QUEL morceau joue en
// mesurant la frequence dominante, et donc verifier que l'ecran de la salle
// passe bien la chanson de la manche, pas seulement "du son".
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const DEBUTS = ["Soleil", "Minuit", "Rivière", "Nuage", "Velours", "Béton", "Comète", "Orage", "Lagune", "Ferraille", "Cerise", "Boussole"]
const FINS = ["de plomb", "sans retour", "en fuite", "du dimanche", "électrique", "sur la ville", "pour personne", "à l'envers"]
const ARTISTES = ["Les Aléas", "Nora Vidal", "Club Mistral", "Hugo Sarrasin", "Pale Fontaine", "Mona Kessler", "Les Démons Doux", "Yanis Orly"]

export const COUNT = 48
export const freqOf = k => 300 + 55 * k // 300 a 2885 Hz, 55 Hz d'ecart : lisible a la FFT

export function catalog() {
  return Array.from({ length: COUNT }, (_, k) => ({
    k,
    title: `${DEBUTS[k % DEBUTS.length]} ${FINS[Math.floor(k / DEBUTS.length) % FINS.length]}`,
    artist: ARTISTES[(k * 5) % ARTISTES.length],
    freq: freqOf(k),
    file: `t${String(k).padStart(2, "0")}.mp3`,
  }))
}

/** Genere les mp3 manquants (ffmpeg). Idempotent. */
export function buildAudio(dir) {
  fs.mkdirSync(dir, { recursive: true })
  for (const t of catalog()) {
    const out = path.join(dir, t.file)
    if (fs.existsSync(out)) continue
    // Ecrit a cote puis renomme : un ffmpeg interrompu ne laisse pas un mp3
    // tronque que existsSync prendrait pour valide ensuite.
    const part = `${out}.part.mp3`
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=${t.freq}:sample_rate=44100:duration=30`,
      "-af", "volume=0.35", "-ac", "1", "-b:a", "64k", part,
    ])
    fs.renameSync(part, out)
  }
  fs.writeFileSync(path.join(dir, "catalog.json"), JSON.stringify(catalog(), null, 2))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dir = process.argv[2]
  if (!dir) { console.error("usage : node catalog.mjs <dossier>"); process.exit(2) }
  buildAudio(dir)
  console.log(`${COUNT} extraits prets dans ${dir}`)
}
