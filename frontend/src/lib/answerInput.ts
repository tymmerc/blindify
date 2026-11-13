/**
 * Attributs des champs ou l'on tape une reponse (titre, artiste). Le correcteur
 * du telephone changeait les noms tapes (soiree du 12/11/2026) : ni correction,
 * ni majuscule automatique, ni suggestion, ni soulignement d'orthographe.
 */
export const ANSWER_INPUT_PROPS = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const
