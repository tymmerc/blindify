// ---------------------------------------------------------------------------
// Presence par room (lobby) : statut affichable de chaque joueur.
//   - "active"       : onglet au premier plan, socket vivant
//   - "away"         : onglet ouvert mais pas devant (alt-tab / minimise)
//   - "disconnected" : socket coupe (onglet ferme / reseau). On garde le slot
//                      pendant un delai de grace pour permettre une reconnexion.
//
// Couche purement d'AFFICHAGE : n'interfere PAS avec la machine a etats du jeu
// (markDisconnected / answerable restent geres par realtimeGame).
// ---------------------------------------------------------------------------

export type MemberStatus = "active" | "away" | "disconnected";

export interface RoomMember {
  userId: number;
  username: string | null;
  status: MemberStatus;
}

const rooms = new Map<string, Map<number, RoomMember>>();
const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const GRACE_MS = 60_000;

function key(roomCode: string, userId: number): string {
  return `${roomCode}:${userId}`;
}

export function upsertMember(roomCode: string, userId: number, username: string | null, status: MemberStatus): void {
  let members = rooms.get(roomCode);
  if (!members) {
    members = new Map();
    rooms.set(roomCode, members);
  }
  const existing = members.get(userId);
  members.set(userId, { userId, username: username ?? existing?.username ?? null, status });
}

export function setStatus(roomCode: string, userId: number, status: MemberStatus): void {
  const member = rooms.get(roomCode)?.get(userId);
  if (member) member.status = status;
}

export function removeMember(roomCode: string, userId: number): void {
  const members = rooms.get(roomCode);
  if (!members) return;
  members.delete(userId);
  if (members.size === 0) rooms.delete(roomCode);
}

export function getMembers(roomCode: string): RoomMember[] {
  return Array.from(rooms.get(roomCode)?.values() ?? []);
}

// Programme la liberation du slot apres le delai de grace. onExpire n'est
// appele que si la grace n'a pas ete annulee (reconnexion) entre-temps.
export function scheduleGrace(roomCode: string, userId: number, onExpire: () => void): void {
  cancelGrace(roomCode, userId);
  const timer = setTimeout(() => {
    graceTimers.delete(key(roomCode, userId));
    onExpire();
  }, GRACE_MS);
  timer.unref?.();
  graceTimers.set(key(roomCode, userId), timer);
}

export function cancelGrace(roomCode: string, userId: number): void {
  const existing = graceTimers.get(key(roomCode, userId));
  if (existing) {
    clearTimeout(existing);
    graceTimers.delete(key(roomCode, userId));
  }
}
