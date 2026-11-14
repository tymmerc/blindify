// Les messages non lus de la bulle de chat (salle d'attente et partie).
// On compare l'heure serveur du message a celle du dernier message vu : le
// fil garde 100 messages au plus, donc sa longueur ne bouge plus une fois plein.

type Stamped = { userId: number; timestamp: number }

/** Heure du dernier message du fil, 0 s'il est vide. */
export function lastStamp(messages: readonly Stamped[]): number {
  return messages.length > 0 ? messages[messages.length - 1].timestamp : 0
}

/** Messages des autres arrives apres `seenAt`. Les siens ne comptent jamais. */
export function countUnread(messages: readonly Stamped[], seenAt: number, meId: number): number {
  let n = 0
  for (const m of messages) if (m.timestamp > seenAt && m.userId !== meId) n += 1
  return n
}
