// « Qui a ajoute ce titre ? » (T7) : le serveur dit pour chaque manche si la
// question est posee (ownerQuestion). A deux joueurs, elle ne l'est plus :
// si ce n'est pas toi, c'est forcement l'autre (sessions 752 a 754 du 01/11).

export const MIN_OWNER_QUESTION_PLAYERS = 3

export function showOwnerQuestion({
  ownerQuestion,
  singleContributor,
  playerCount,
}: {
  ownerQuestion?: boolean
  singleContributor?: boolean
  playerCount: number
}): boolean {
  if (singleContributor) return false
  // Serveur d'avant T7 (sans le drapeau) : meme regle, comptee ici.
  return ownerQuestion ?? playerCount >= MIN_OWNER_QUESTION_PLAYERS
}
