import { pool } from "../config/db";
import { shuffle } from "./trackResolution";

/**
 * L'ordre et le choix des manches d'une salle (T37, soiree du 12/11/2026).
 */

/** Une soiree : meme fenetre que used_tracks pour le solo. */
const EVENING_HOURS = 12;

/**
 * Les morceaux deja joues ce soir devant au moins un de ces joueurs (cle
 * external_id, ou id, comme le dedoublonnage du lancement). On regarde les
 * parties, pas la salle : une relance se fait souvent dans une nouvelle salle.
 * L'hote compte aussi quand il presente sans jouer (mode evenement).
 */
export async function heardTonight(userIds: number[]): Promise<string[]> {
  if (!userIds.length) return [];
  const { rows } = await pool.query<{ key: string }>(
    `SELECT DISTINCT COALESCE(s.external_id, s.id::text) AS key
     FROM game_sessions gs
     JOIN game_rounds gr ON gr.session_id = gs.id
     JOIN audio_sources s ON s.id = gr.audio_source_id
     WHERE gs.started_at >= NOW() - make_interval(hours => $2)
       AND gs.mode <> 'solo'
       AND (gs.host_user_id = ANY($1::int[])
            OR EXISTS (SELECT 1 FROM game_participants gp WHERE gp.session_id = gs.id AND gp.user_id = ANY($1::int[])))`,
    [userIds, EVENING_HOURS]
  );
  return rows.map(row => row.key);
}

/**
 * Peut-on encore tout placer sans deux du meme a la suite, la derniere manche
 * etant a `last` ? Il faut assez des autres pour separer le plus nombreux.
 */
function canAlternate(counts: Map<string, number>, last: string | null): boolean {
  let total = 0;
  let max = 0;
  for (const n of counts.values()) {
    total += n;
    max = Math.max(max, n);
  }
  if (max === 0) return true;
  const otherAtMax = [...counts].some(([owner, n]) => n === max && owner !== last);
  // Le plus nombreux peut ouvrir la suite seulement s'il n'est pas `last`.
  return otherAtMax ? max <= total - max + 1 : max <= total - max;
}

/**
 * Ordonne les manches pour que deux manches de suite ne viennent jamais du
 * meme joueur (demande de Tym). Au hasard parmi les choix qui gardent cette
 * promesse possible jusqu'au bout ; si elle ne l'est plus (un joueur a
 * beaucoup plus de morceaux que les autres reunis), le plus nombreux passe
 * des que possible, et les manches de suite restent en fin de partie, quand
 * il est seul a avoir encore des morceaux.
 */
export function alternateOwners<T>(items: T[], ownerOf: (item: T) => string): T[] {
  const queues = new Map<string, T[]>();
  for (const item of shuffle(items)) {
    const owner = ownerOf(item);
    queues.set(owner, [...(queues.get(owner) ?? []), item]);
  }
  const counts = new Map([...queues].map(([owner, list]) => [owner, list.length]));
  const ordered: T[] = [];
  let last: string | null = null;
  while (ordered.length < items.length) {
    const open = shuffle([...counts].filter(([owner, n]) => n > 0 && owner !== last).map(([owner]) => owner));
    const keepsPromise = open.find(owner => {
      const after = new Map(counts);
      after.set(owner, (after.get(owner) ?? 0) - 1);
      return canAlternate(after, owner);
    });
    const largest = (owners: string[]) =>
      owners.reduce<string | null>((best, owner) => (best === null || (counts.get(owner) ?? 0) > (counts.get(best) ?? 0) ? owner : best), null);
    // Personne d'autre n'a de morceaux : la seule exception admise.
    const next = keepsPromise ?? largest(open) ?? largest([...counts].filter(([, n]) => n > 0).map(([owner]) => owner));
    if (next === null) break;
    ordered.push(queues.get(next)!.shift()!);
    counts.set(next, (counts.get(next) ?? 0) - 1);
    last = next;
  }
  return ordered;
}
