import fs from "fs";
import path from "path";
import { pool } from "../config/db";

/**
 * Bibliotheque par joueur : table user_audio_sources (migration 005).
 *
 * Un morceau (audio_sources) n'existe qu'une fois sur la plateforme, mais il
 * peut etre a plusieurs joueurs : chacun qui l'importe recoit son lien, avec la
 * carte d'ou il vient. Avant, seul le premier importeur le gardait, et le
 * suivant se retrouvait sans musique.
 */

// dist/services en prod, src/services en test : le dossier migrations est a
// la racine du backend dans les deux cas (il entre dans l'image Docker).
const MIGRATION = path.resolve(__dirname, "../../migrations/005_user_audio_sources.sql");

// Premiere application sur une base neuve (pile de test, CI) : elle verrouille
// audio_sources, users et game_rounds pendant que le reste du demarrage (ou
// une autre suite de tests) ecrit dedans, et Postgres peut l'interrompre pour
// interblocage. Le fichier est transactionnel et rejouable : on recommence.
const DEADLOCK = "40P01";
const ATTEMPTS = 3;

const isDeadlock = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === DEADLOCK;

/**
 * Rejoue la migration 005 (idempotente). Appelee au demarrage : la prod l'a
 * deja, la pile de test et la CI partent du schema de la prod et ne l'ont pas
 * encore. Un seul fichier fait foi, pas de copie du SQL a tenir a jour ici.
 */
export async function ensureUserTracksSchema(): Promise<void> {
  const sql = await fs.promises.readFile(MIGRATION, "utf8");
  for (let attempt = 1; ; attempt++) {
    try {
      await runMigration(sql);
      return;
    } catch (err) {
      if (!isDeadlock(err) || attempt >= ATTEMPTS) throw err;
    }
  }
}

async function runMigration(sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(sql);
  } catch (err) {
    // Le fichier ouvre sa propre transaction : sans ce ROLLBACK, la connexion
    // retournerait au pool dans une transaction avortee.
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Relie un joueur a un morceau qu'il vient d'importer. Reimporter ne cree pas
 * de doublon ; la carte la plus recente l'emporte, comme avant pour le
 * premier importeur. `linkId` doit deja etre une carte de CE joueur.
 */
export async function linkTrackToUser(userId: number, audioSourceId: string, linkId: number | null): Promise<void> {
  await pool.query(
    `INSERT INTO user_audio_sources (user_id, audio_source_id, link_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, audio_source_id)
     DO UPDATE SET link_id = COALESCE(EXCLUDED.link_id, user_audio_sources.link_id)`,
    [userId, audioSourceId, linkId]
  );
}

/**
 * Les joueurs ranges de la plus petite bibliotheque a la plus grande (ordre
 * d'origine a egalite). Le lancement fait tirer les petites d'abord : un
 * morceau partage ne doit pas manquer a celui qui en a le moins.
 */
export async function bySmallestLibrary(userIds: number[]): Promise<number[]> {
  if (!userIds.length) return [];
  const { rows } = await pool.query<{ user_id: number; n: string }>(
    `SELECT user_id, count(*) AS n FROM user_audio_sources
     WHERE user_id = ANY($1::int[]) GROUP BY user_id`,
    [userIds]
  );
  const size = new Map(rows.map(row => [row.user_id, Number(row.n)]));
  return [...userIds].sort((a, b) => (size.get(a) ?? 0) - (size.get(b) ?? 0));
}

/**
 * Pour chaque morceau, les joueurs de la liste qui l'ont importe (toutes
 * cartes confondues, cochees ou non). Sert au « qui a mis quoi » : un morceau
 * partage compte pour chacun de ses importeurs presents.
 */
export async function ownersAmong(audioSourceIds: string[], userIds: number[]): Promise<Map<string, number[]>> {
  const owners = new Map<string, number[]>();
  if (!audioSourceIds.length || !userIds.length) return owners;
  const { rows } = await pool.query<{ audio_source_id: string; user_id: number }>(
    `SELECT audio_source_id, user_id FROM user_audio_sources
     WHERE audio_source_id = ANY($1::uuid[]) AND user_id = ANY($2::int[])
     ORDER BY user_id`,
    [audioSourceIds, userIds]
  );
  for (const row of rows) {
    owners.set(row.audio_source_id, [...(owners.get(row.audio_source_id) ?? []), row.user_id]);
  }
  return owners;
}
