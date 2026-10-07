/**
 * Combien d'extraits Spotify stockes viennent d'une autre version ? LECTURE SEULE.
 *
 * Tire N morceaux Spotify (N <= 20) dont l'extrait vient de Deezer, refait pour
 * chacun LA recherche de l'application (1 appel Deezer, espaces de 1,5 s), puis :
 *  - retrouve parmi les resultats le morceau dont vient l'extrait stocke
 *    (meme fichier mp3) et dit s'il est de la meme version que la source ;
 *  - dit ce que la nouvelle regle choisirait (meme morceau, un autre, rien).
 * Avec --avec-mention : seulement des titres qui portent une mention de version
 * ("(...)", "[...]", " - ..."), avec ou sans extrait stocke ; compte ceux qui
 * perdraient leur extrait avec la nouvelle regle.
 * Rien n'est ecrit nulle part. Lancer depuis backend/ :
 *   npx ts-node --transpile-only --project tsconfig.json ../tools/extrait/echantillon.ts 20 [--avec-mention]
 */
import { spawnSync } from "node:child_process";
import { isSameVersion, pickMatch, searchQueryFor, type MatchCandidate } from "../../backend/src/services/previewMatch";

const MAX_CALLS = 20;
const PAUSE_MS = 1_500;

interface Row { external_id: string; title: string; artist: string; duration_ms: number | null; audio_url: string | null }

function sample(n: number, withMention: boolean): Row[] {
  const where = withMention
    ? `provider = 'spotify' AND title ~ '\\(|\\[| - '`
    : `provider = 'spotify' AND audio_url ~ 'dzcdn\\.net'`;
  const sql = `SELECT coalesce(json_agg(t), '[]') FROM (
    SELECT external_id, title, artist, duration_ms, audio_url FROM audio_sources
    WHERE ${where} ORDER BY random() LIMIT ${n}) t`;
  const out = spawnSync("docker", ["exec", "-i", "blindify-postgres", "psql", "-U", "blindify", "-d", "blindify", "-At", "-c", sql], { encoding: "utf8" });
  if (out.status !== 0) throw new Error(`psql: ${out.stderr}`);
  return JSON.parse(out.stdout.trim()) as Row[];
}

const mp3 = (url?: string | null) => (url ?? "").split("?")[0];

async function search(q: string): Promise<MatchCandidate[]> {
  const res = await fetch(`https://api.deezer.com/search?${new URLSearchParams({ q, limit: "10" })}`);
  const body = (await res.json()) as { data?: MatchCandidate[]; error?: unknown };
  if (body.error) throw new Error(`Deezer: ${JSON.stringify(body.error)}`);
  return body.data ?? [];
}

async function main(): Promise<void> {
  const n = Math.min(Math.max(Number(process.argv[2]) || MAX_CALLS, 1), MAX_CALLS);
  const rows = sample(n, process.argv.includes("--avec-mention"));
  const tally = { memeVersion: 0, autreVersion: 0, introuvable: 0, sansExtraitStocke: 0, nouveauIdentique: 0, nouveauAutre: 0, nouveauRien: 0, perdus: 0, gagnes: 0 };
  for (const [i, row] of rows.entries()) {
    if (i > 0) await new Promise(r => setTimeout(r, PAUSE_MS));
    const items = await search(searchQueryFor(row.title, row.artist));
    const stored = row.audio_url ? items.find(c => mp3(c.preview) === mp3(row.audio_url)) : undefined;
    const want = { title: row.title, artist: row.artist, durationMs: row.duration_ms };
    let verdict = "introuvable";
    if (stored?.title) {
      const same = isSameVersion(stored, want);
      verdict = same ? "meme version" : "AUTRE VERSION";
      if (same) tally.memeVersion++; else tally.autreVersion++;
    } else if (row.audio_url) tally.introuvable++;
    else { verdict = "pas d'extrait stocke"; tally.sansExtraitStocke++; }
    const next = pickMatch(items, want);
    const nouveau = !next ? "rien" : stored && next.id === stored.id ? "identique" : "autre";
    if (nouveau === "rien") tally.nouveauRien++; else if (nouveau === "identique") tally.nouveauIdentique++; else tally.nouveauAutre++;
    // Perdu : un extrait de la bonne version etait stocke, la nouvelle regle n'en trouve plus.
    if (!next && verdict === "meme version") tally.perdus++;
    if (next && !row.audio_url) tally.gagnes++;
    console.log(`${row.external_id}\t${row.title} / ${row.artist}\tstocke: ${stored?.title ?? "?"} -> ${verdict}\tnouvelle regle: ${next?.title ?? "aucun extrait"} (${nouveau})`);
  }
  console.log(JSON.stringify({ echantillon: rows.length, appelsDeezer: rows.length, ...tally }));
}

main().catch(err => { console.error(err); process.exit(1); });
