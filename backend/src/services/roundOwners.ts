/**
 * « Qui a mis quoi » : a qui revient le morceau d'une manche.
 *
 * Le lancement range dans metadata :
 * - owner_user_id : le joueur dont la carte a apporte le morceau ce soir ;
 * - owner_user_ids : tous les joueurs de la salle qui l'ont importe (un
 *   morceau peut etre a plusieurs, voir services/userTracks.ts).
 * Deviner n'importe lequel d'entre eux rapporte le point : celui qui avait le
 * morceau dans sa bibliotheque n'a pas tort de se designer.
 */

function toUserId(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Le contributeur d'abord, puis les autres importeurs, sans doublon. */
export function roundOwnerIds(metadata: unknown): number[] {
  if (!metadata || typeof metadata !== "object") return [];
  const meta = metadata as Record<string, unknown>;
  const primary = toUserId(meta.owner_user_id);
  const shared = Array.isArray(meta.owner_user_ids)
    ? meta.owner_user_ids.map(toUserId).filter((id): id is number => id !== null)
    : [];
  return Array.from(new Set(primary ? [primary, ...shared] : shared));
}

export function isOwnerGuess(metadata: unknown, guess: number | null | undefined): boolean {
  return guess != null && roundOwnerIds(metadata).includes(guess);
}

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Les candidats du picker : un bon (le contributeur s'il joue, sinon un autre
 * importeur present) et deux leurres qui n'ont PAS le morceau. S'il manque de
 * leurres, on complete avec les autres importeurs, qui sont aussi justes.
 * Moins de 3 joueurs, ou personne de la salle a qui il revient : tout le monde.
 */
export function ownerChoices(metadata: unknown, playerIds: number[]): number[] {
  const owners = roundOwnerIds(metadata).filter(id => playerIds.includes(id));
  if (!owners.length || playerIds.length < 3) return playerIds;
  const [right, ...otherOwners] = owners;
  const decoys = shuffled(playerIds.filter(id => !owners.includes(id)));
  return shuffled([right, ...decoys, ...shuffled(otherOwners)].slice(0, 3));
}
