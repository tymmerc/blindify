/**
 * Rattrapage des ISRC des morceaux Spotify importes avant le 07/10/2026.
 *
 * Sans ISRC, l'extrait d'un morceau Spotify se cherche par titre chez Deezer,
 * et un titre sans version sure est saute (ex. "You Say Run" de l'OST de My
 * Hero Academia). Avec l'ISRC, Deezer donne l'enregistrement exact.
 *
 * Par lots de 50 : GET /v1/tracks?ids=... (jeton client de l'app, aucun appel
 * Deezer), puis, avec --ecrire seulement, ajout de la cle `isrc` dans metadata
 * (les autres cles restent), une transaction courte par lot.
 *
 *   node dist/scripts/rattrapageIsrc.js            essai : rien n'est ecrit
 *   node dist/scripts/rattrapageIsrc.js --ecrire   ecrit les ISRC trouves
 *   options : --lots N (s'arreter apres N lots ; --lots 1 = une seule requete Spotify)
 *
 * Reprenable : seuls les morceaux encore sans ISRC sont selectionnes.
 * N'affiche jamais le jeton ni les en-tetes des requetes.
 */
import axios from "axios";
import type { Pool } from "pg";
import { getSpotifyClientToken } from "../services/profileImportService";

export const BATCH_SIZE = 50;
const PAUSE_MS = 1_000;
const MAX_RETRY_AFTER_S = 120; // au-dela, on arrete : relancer plus tard
const MAX_ATTEMPTS = 3;
const MAX_TOO_MANY = 5; // reponses 429 sur un lot avant d'abandonner
const MAX_FAILED_BATCHES = 5; // lots en erreur d'affilee avant d'abandonner
const ISRC_STRICT = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const SPOTIFY_TRACKS_URL = "https://api.spotify.com/v1/tracks";

export interface RattrapageOptions {
  write: boolean;
  maxBatches?: number;
  pauseMs?: number;
  log?: (line: string) => void;
  /** Attente injectable (tests). */
  sleep?: (ms: number) => Promise<void>;
}

export interface RattrapageTotals {
  traites: number;
  isrcTrouves: number;
  sansIsrc: number;
  erreurs: number;
  ecrits: number;
  arretAnticipe: string | null;
}

type Row = { external_id: string };

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** ISRC normalise, ou null s'il ne passe pas la validation stricte. */
export function strictIsrc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const isrc = value.trim().toUpperCase();
  return ISRC_STRICT.test(isrc) ? isrc : null;
}

/** Le lot suivant, apres `after` (pagination par id : un passage = un essai par morceau). */
async function nextBatch(pool: Pool, after: string): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    `SELECT external_id FROM audio_sources
     WHERE provider = 'spotify'
       AND metadata->>'isrc' IS NULL -- absente ou null (les imports ecrivent "isrc": null)
       AND external_id ~ '^[A-Za-z0-9]{22}$'
       AND external_id > $1
     ORDER BY external_id
     LIMIT $2`,
    [after, BATCH_SIZE]
  );
  return rows;
}

class StopError extends Error {}

/** Attente demandee par un 429, bornee a [1, MAX_RETRY_AFTER_S] ; null si trop longue. */
function retryAfterSeconds(err: unknown): number | null {
  const raw = Number(axios.isAxiosError(err) ? err.response?.headers?.["retry-after"] : NaN);
  const seconds = Number.isFinite(raw) ? Math.max(1, Math.ceil(raw)) : 5;
  return seconds > MAX_RETRY_AFTER_S ? null : seconds;
}

/** ISRC par id Spotify pour un lot (meme ordre que les ids demandes). */
async function fetchIsrcs(ids: string[], sleepFn: (ms: number) => Promise<void>): Promise<Map<string, string | null>> {
  let tooMany = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      const token = await getSpotifyClientToken();
      const { data } = await axios.get<{ tracks?: Array<{ id?: string; external_ids?: { isrc?: string } } | null> }>(
        SPOTIFY_TRACKS_URL,
        { headers: { Authorization: `Bearer ${token}` }, params: { ids: ids.join(",") }, timeout: 15_000 }
      );
      const tracks = data?.tracks ?? [];
      // Un morceau renvoye sous un autre id (decalage, relinking) : on n'ecrit rien pour lui.
      return new Map(ids.map((id, i) => [id, tracks[i]?.id === id ? strictIsrc(tracks[i]?.external_ids?.isrc) : null]));
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 429) {
        tooMany++;
        const wait = retryAfterSeconds(err);
        if (wait === null || tooMany >= MAX_TOO_MANY) {
          throw new StopError(`Spotify limite les appels (${tooMany} reponses 429) : relancer plus tard`);
        }
        await sleepFn(wait * 1000);
        continue;
      }
      if (attempt >= MAX_ATTEMPTS) {
        // Jamais l'erreur entiere, meme en `cause` : elle contient la requete, donc le jeton.
        // eslint-disable-next-line preserve-caught-error
        throw new Error(`Spotify ${status ?? "injoignable"} : ${(err as Error).message}`);
      }
      await sleepFn(1_000 * attempt);
    }
  }
}

/** Ecrit les ISRC d'un lot : uniquement la cle isrc, une transaction courte. */
async function writeBatch(pool: Pool, found: Array<[string, string]>): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const { rowCount } = await client.query(
      `UPDATE audio_sources AS a
       SET metadata = COALESCE(a.metadata, '{}'::jsonb) || jsonb_build_object('isrc', v.isrc)
       FROM unnest($1::text[], $2::text[]) AS v(external_id, isrc)
       WHERE a.provider = 'spotify'
         AND a.external_id = v.external_id
         AND a.metadata->>'isrc' IS NULL`,
      [found.map(([id]) => id), found.map(([, isrc]) => isrc)]
    );
    await client.query("COMMIT");
    return rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function rattrapageIsrc(pool: Pool, opts: RattrapageOptions): Promise<RattrapageTotals> {
  const log = opts.log ?? (line => console.log(line));
  const pauseMs = opts.pauseMs ?? PAUSE_MS;
  const sleepFn = opts.sleep ?? sleep;
  let failedInARow = 0;
  const totals: RattrapageTotals = { traites: 0, isrcTrouves: 0, sansIsrc: 0, erreurs: 0, ecrits: 0, arretAnticipe: null };
  // Identifiants absents ou refuses : on s'arrete avant le premier lot.
  await getSpotifyClientToken();
  let after = "";
  for (let lot = 1; opts.maxBatches === undefined || lot <= opts.maxBatches; lot++) {
    const rows = await nextBatch(pool, after);
    if (rows.length === 0) break;
    after = rows[rows.length - 1].external_id;
    if (lot > 1) await sleepFn(pauseMs);
    const ids = rows.map(r => r.external_id);
    totals.traites += ids.length;
    try {
      const isrcs = await fetchIsrcs(ids, sleepFn);
      const found = ids.flatMap(id => {
        const isrc = isrcs.get(id);
        return isrc ? [[id, isrc] as [string, string]] : [];
      });
      totals.isrcTrouves += found.length;
      totals.sansIsrc += ids.length - found.length;
      const written = opts.write && found.length > 0 ? await writeBatch(pool, found) : 0;
      totals.ecrits += written;
      failedInARow = 0;
      log(`lot ${lot} : ${ids.length} morceaux, ${found.length} ISRC${opts.write ? `, ${written} ecrits` : ""}`);
    } catch (err) {
      totals.erreurs += ids.length;
      if (err instanceof StopError) {
        totals.arretAnticipe = err.message;
        log(`lot ${lot} : arret, ${err.message}`);
        break;
      }
      log(`lot ${lot} : erreur, ${(err as Error).message}`);
      if (++failedInARow >= MAX_FAILED_BATCHES) {
        totals.arretAnticipe = `${MAX_FAILED_BATCHES} lots en erreur d'affilee : relancer plus tard`;
        log(`arret : ${totals.arretAnticipe}`);
        break;
      }
    }
  }
  return totals;
}

export function parseArgs(argv: string[]): RattrapageOptions {
  const write = argv.includes("--ecrire");
  const i = argv.indexOf("--lots");
  const maxBatches = i >= 0 ? Number(argv[i + 1]) : undefined;
  if (maxBatches !== undefined && !(Number.isInteger(maxBatches) && maxBatches > 0)) {
    throw new Error("--lots attend un entier positif");
  }
  return { write, maxBatches };
}

if (require.main === module) {
  (async () => {
    const opts = parseArgs(process.argv.slice(2));
    // Import tardif : la configuration de la base (DATABASE_URL) est celle du backend.
    const { pool } = await import("../config/db");
    console.log(`rattrapage ISRC, mode ${opts.write ? "ECRITURE" : "essai (rien n'est ecrit)"}`);
    try {
      const totals = await rattrapageIsrc(pool, opts);
      console.log(`fin : ${totals.traites} traites, ${totals.isrcTrouves} ISRC trouves, ${totals.sansIsrc} sans ISRC, ${totals.erreurs} erreurs, ${totals.ecrits} ecrits${totals.arretAnticipe ? ` (arret : ${totals.arretAnticipe})` : ""}`);
      process.exitCode = totals.erreurs > 0 ? 1 : 0;
    } catch (err) {
      console.error(`echec : ${(err as Error).message}`);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}
