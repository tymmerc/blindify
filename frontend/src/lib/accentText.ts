// L'accent d'un mode (terre cuite, or, sauge...) sert de fond ET de couleur de
// texte. En texte il lui faut sa variante lisible : plus claire en nuit chaude,
// plus foncee sur papier pour l'or et la sauge (1,9:1 et 2,8:1 sinon). T30.
const TEXTE: Record<string, string> = {
  "#c65133": "terra-txt",
  "#cc4830": "vermillon-txt",
  "#9c2f1d": "rouge-txt",
  "#e0a32e": "gold-deep-txt",
  "#d88418": "ambre-txt",
  "#7d9471": "sage-deep-txt",
  "#486090": "acier-txt",
}

export function accentTexte(accent: string): string {
  const jeton = TEXTE[accent.trim().toLowerCase()]
  return jeton ? `rgb(var(--c-${jeton}))` : accent
}
