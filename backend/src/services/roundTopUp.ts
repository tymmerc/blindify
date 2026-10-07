import type { AudioSourceRow } from "../types/audio";
import { sourceKey, type PlayableBatch } from "./trackResolution";

/**
 * Complement des manches au lancement d'une salle.
 *
 * Le tirage demande N titres, puis l'hydratation Deezer ecarte ceux sans
 * extrait. Avant, la partie partait avec ce qui restait (16 manches sur 20 le
 * 07/10, salle 3Y9YRK) alors que les bibliotheques des joueurs avaient encore
 * des titres jouables. Ici on retire dans les memes bibliotheques, borne : au
 * plus TOP_UP_MAX_PASSES passes, chacune tire au plus DRAW_MARGIN fois le
 * nombre de titres qui manquent. Les recherches Deezer restent sous le garde
 * du lancement (lookupGuard.ts).
 */
export const TOP_UP_MAX_PASSES = 2;

/** Titres tires en base par passe, par titre manquant. */
export const DRAW_MARGIN = 3;

/**
 * Un tirage dans la bibliotheque d'un joueur : `drawLimit` lignes au plus, hors
 * `excludeKeys` ; `wanted` titres jouables suffisent (on cesse de chercher).
 */
export type DrawFromPlayer = (userId: number, drawLimit: number, excludeKeys: string[], wanted: number) => Promise<PlayableBatch>;

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
 * Retire des titres jouables jusqu'a `target` (jamais plus), ou jusqu'a
 * epuisement des bibliotheques. Les joueurs qui ont le moins de titres dans la
 * partie tirent en premier, pour garder le tourniquet equitable. Ne modifie
 * pas `current`.
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
    let budget = DRAW_MARGIN * (params.target - sources.length);
    let drawnThisPass = 0;

    for (let i = 0; i < order.length && budget > 0 && sources.length < params.target; i++) {
      const pid = order[i];
      // Part du budget de la passe ; un joueur a sec laisse sa part aux suivants.
      const share = Math.ceil(budget / (order.length - i));
      const taken = new Set(sources.map(sourceKey));
      const wanted = params.target - sources.length;
      const batch = await params.draw(pid, share, [...taken, ...rejected], wanted);
      budget -= batch.drawn;
      drawnThisPass += batch.drawn;
      for (const key of batch.rejectedKeys) rejected.add(key);
      const fresh = batch.playable
        .filter(src => !taken.has(sourceKey(src)))
        .slice(0, wanted)
        .map(src => ({ ...src, user_id: pid }));
      sources = [...sources, ...fresh];
    }

    drawn += drawnThisPass;
    // Plus rien a tirer chez personne : inutile de refaire une passe.
    if (drawnThisPass === 0) break;
  }

  return { sources, rejectedKeys: rejected, passes, drawn };
}
