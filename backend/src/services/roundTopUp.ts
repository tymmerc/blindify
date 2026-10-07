import type { AudioSourceRow } from "../types/audio";
import { sourceKey, type PlayableBatch } from "./trackResolution";

/**
 * Complement des manches au lancement d'une salle.
 *
 * Le tirage demande N titres, puis l'hydratation Deezer ecarte ceux sans
 * extrait. Avant, la partie partait avec ce qui restait (16 manches sur 20 le
 * 07/10, salle 3Y9YRK) alors que les bibliotheques des joueurs avaient encore
 * des titres jouables. Ici on retire dans les memes bibliotheques, borne : au
 * plus TOP_UP_MAX_PASSES passes, chacune tire au plus `target` titres en base.
 */
export const TOP_UP_MAX_PASSES = 2;

/**
 * Recherches d'extrait permises pour tout un lancement (tirage, verification
 * finale et complement compris), par manche demandee, ou par joueur s'ils sont
 * plus nombreux que les manches. 20 manches : 120 au pire ; 30 (le maximum du
 * lobby) : 180.
 */
export const LOOKUPS_PER_ROUND = 6;

/** Un tirage dans la bibliotheque d'un joueur : `drawLimit` lignes au plus, hors `excludeKeys`. */
export type DrawFromPlayer = (userId: number, drawLimit: number, excludeKeys: string[]) => Promise<PlayableBatch>;

export type TopUpResult = {
  sources: AudioSourceRow[];
  rejectedKeys: ReadonlySet<string>;
  passes: number;
  drawn: number;
};

/** Combien de titres chaque joueur a deja dans la partie. */
function sharesOf(sources: readonly AudioSourceRow[], contributorIds: readonly number[]): Map<number, number> {
  const shares = new Map<number, number>(contributorIds.map(id => [id, 0]));
  for (const src of sources) {
    const owner = src.user_id ?? null;
    if (owner !== null && shares.has(owner)) shares.set(owner, (shares.get(owner) ?? 0) + 1);
  }
  return shares;
}

/**
 * Retire des titres jouables jusqu'a `target`, ou jusqu'a epuisement des
 * bibliotheques. Les joueurs qui ont le moins de titres dans la partie tirent
 * en premier, pour garder le tourniquet equitable. Ne modifie pas `current`.
 */
export async function topUpPlayable(params: {
  current: readonly AudioSourceRow[];
  target: number;
  contributorIds: readonly number[];
  rejectedKeys: ReadonlySet<string>;
  draw: DrawFromPlayer;
}): Promise<TopUpResult> {
  let sources = [...params.current];
  const rejected = new Set(params.rejectedKeys);
  let passes = 0;
  let drawn = 0;

  while (sources.length < params.target && passes < TOP_UP_MAX_PASSES) {
    passes += 1;
    const shares = sharesOf(sources, params.contributorIds);
    const order = [...params.contributorIds].sort((a, b) => (shares.get(a) ?? 0) - (shares.get(b) ?? 0));
    let budget = params.target;
    let drawnThisPass = 0;

    for (let i = 0; i < order.length && budget > 0 && sources.length < params.target; i++) {
      const pid = order[i];
      // Part du budget de la passe ; un joueur a sec laisse sa part aux suivants.
      const share = Math.ceil(budget / (order.length - i));
      const taken = new Set(sources.map(sourceKey));
      const batch = await params.draw(pid, share, [...taken, ...rejected]);
      budget -= batch.drawn;
      drawnThisPass += batch.drawn;
      for (const key of batch.rejectedKeys) rejected.add(key);
      const fresh = batch.playable
        .filter(src => !taken.has(sourceKey(src)))
        .map(src => ({ ...src, user_id: pid }));
      sources = [...sources, ...fresh];
    }

    drawn += drawnThisPass;
    // Plus rien a tirer chez personne : inutile de refaire une passe.
    if (drawnThisPass === 0) break;
  }

  return { sources, rejectedKeys: rejected, passes, drawn };
}
