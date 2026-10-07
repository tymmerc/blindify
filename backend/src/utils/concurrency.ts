/**
 * Applique `fn` a chaque element, `limit` a la fois au plus, et rend les
 * resultats dans l'ordre de la liste. Sert a ne pas envoyer des dizaines de
 * recherches Deezer d'un coup au lancement d'une salle. A la premiere erreur,
 * plus aucun element n'est commence et l'erreur remonte.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  await Promise.all(Array.from({ length: width }, worker));
  return results;
}
