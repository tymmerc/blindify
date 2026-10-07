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

// Premiere application sur une base neuve (pile de test, CI) : sa transaction
// de schema verrouille audio_sources, users et game_rounds pendant que le reste
// du demarrage (ou une autre suite de tests) ecrit dedans. Postgres peut
// l'interrompre pour interblocage, ou elle abandonne au bout de 3 s d'attente
// (lock_timeout). Le fichier est rejouable : on recommence.
const RETRYABLE = new Set(["40P01", "55P03"]); // deadlock_detected, lock_not_available
const ATTEMPTS = 3;

const isRetryable = (err: unknown): boolean =>
  typeof err === "object" && err !== null && RETRYABLE.has(String((err as { code?: unknown }).code));

// Les envois du fichier, dans l'ordre. La reprise de l'existant fait un COMMIT
// par lot dans un bloc DO, ce que Postgres refuse dans une requete a plusieurs
// commandes : elle doit partir seule. Le fichier marque ses coupures.
const SPLIT = /^-- @envoi.*$/m;
const hasSql = (part: string): boolean => part.replace(/^\s*--.*$/gm, "").trim() !== "";
const parts = (sql: string): string[] => sql.split(SPLIT).filter(hasSql);

/**
 * Rejoue la migration 005 (idempotente). Appelee au demarrage : la prod l'a
 * deja, la pile de test et la CI partent du schema de la prod et ne l'ont pas
 * encore. Un seul fichier fait foi, pas de copie du SQL a tenir a jour ici.
 */
export async function ensureUserTracksSchema(): Promise<void> {
  const sql = await fs.promises.readFile(MIGRATION, "utf8");
  for (let attempt = 1; ; attempt++) {
    try {
      await runMigration(parts(sql));
      return;
    } catch (err) {
      if (!isRetryable(err) || attempt >= ATTEMPTS) throw err;
    }
  }
}

async function runMigration(steps: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    for (const step of steps) await client.query(step);
  } catch (err) {
    // Le fichier ouvre ses propres transactions : sans ce ROLLBACK, la
    // connexion retournerait au pool dans une transaction avortee.
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Relier un joueur a un morceau : reimporter ne cree pas de doublon, la carte
// la plus recente l'emporte, et un lien deja juste n'est pas reecrit (chaque
// import repasse sur chaque morceau). Meme regle que le declencheur de la 005.
export const LINK_UPSERT = `ON CONFLICT (user_id, audio_source_id)
     DO UPDATE SET link_id = COALESCE(EXCLUDED.link_id, user_audio_sources.link_id)
     WHERE user_audio_sources.link_id IS DISTINCT FROM COALESCE(EXCLUDED.link_id, user_audio_sources.link_id)`;

/**
 * Relie un joueur a un morceau qu'il vient d'importer. `linkId` doit deja etre
 * une carte de CE joueur.
 */
export async function linkTrackToUser(userId: number, audioSourceId: string, linkId: number | null): Promise<void> {
  await pool.query(
    `INSERT INTO user_audio_sources (user_id, audio_source_id, link_id)
     VALUES ($1, $2, $3)
     ${LINK_UPSERT}`,
    [userId, audioSourceId, linkId]
  );
}

/**
 * Les liens qui jouent ce soir, pour l'alias `ua` de user_audio_sources : un
 * joueur sans aucune carte joue tout son fonds (legacy), sinon seulement ses
 * cartes cochees. Meme regle que le tirage au lancement (activeLinkIds).
 * `user` : le joueur, quand la requete l'a deja (le lobby, par participant).
 */
export const PLAYS_TONIGHT = (ua: string, user = `${ua}.user_id`): string => `(
      NOT EXISTS (SELECT 1 FROM imported_links il WHERE il.user_id = ${user})
      OR EXISTS (SELECT 1 FROM imported_links il2 WHERE il2.id = ${ua}.link_id AND il2.user_id = ${user} AND il2.active))`;

/**
 * Le fonds commun, pour l'alias `s` d'audio_sources : les morceaux que
 * personne n'a importes. `user_id IS NULL` d'abord, pour l'index
 * idx_audio_sources_user : un morceau qui a un premier importeur a toujours
 * son lien (declencheurs de la 005), il n'est jamais au fonds commun. Le NOT
 * EXISTS ecarte ceux que le premier importeur a retires mais qu'un autre garde.
 */
export const UNOWNED = (s: string): string =>
  `${s}.user_id IS NULL AND NOT EXISTS (SELECT 1 FROM user_audio_sources x WHERE x.audio_source_id = ${s}.id)`;

/**
 * Les joueurs ranges de la plus petite bibliotheque a la plus grande (ordre
 * d'origine a egalite). Le lancement fait tirer les petites d'abord : un
 * morceau partage ne doit pas manquer a celui qui en a le moins. On compte
 * ce qui joue ce soir (cartes cochees), comme le lobby.
 */
export async function bySmallestLibrary(userIds: number[]): Promise<number[]> {
  if (!userIds.length) return [];
  const { rows } = await pool.query<{ user_id: number; n: string }>(
    `SELECT ua.user_id, count(*) AS n FROM user_audio_sources ua
     WHERE ua.user_id = ANY($1::int[]) AND ${PLAYS_TONIGHT("ua")}
     GROUP BY ua.user_id`,
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
