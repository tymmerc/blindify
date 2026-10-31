/**
 * Filtre des pseudos du mode streamer (T5) : ils s'affichent sur le stream
 * (classement de l'overlay). Une petite liste d'insultes courantes, en
 * francais et en anglais, cherchee dans le pseudo normalise : minuscules,
 * sans accents, leet de base (0->o, 1->i, 3->e, 4->a, 5->s, 7->t, @->a, $->s),
 * sans espaces ni signes, lettres repetees reduites.
 *
 * Ce n'est pas une moderation complete : le streamer garde le bouton
 * « Exclure ». Le refus reste neutre (on ne dit pas quel mot a bloque).
 */

// Racines : un pseudo qui CONTIENT l'une d'elles est refuse. Des racines assez
// longues ou assez marquees pour ne pas bloquer des prenoms courants.
const BLOCKED_ROOTS: readonly string[] = [
  // francais
  "connard", "connasse", "salope", "salaud", "encule", "enkule", "pute", "putain", "batard",
  "nique", "niquer", "ntm", "fdp", "pd", "pede", "tapette", "gouine", "negre", "bougnoul",
  "youpin", "bite", "couille", "chatte", "branleur", "pouffiasse", "trouduc", "conne",
  "merde", "nazi", "hitler", "violeur", "pedophile", "pedo",
  // anglais
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "whore", "slut", "nigger", "nigga",
  "faggot", "fag", "retard", "rape", "rapist", "asshole", "bastard", "cock", "twat", "wank",
  "kys",
];

// Racines tres courtes : seulement si le pseudo entier (normalise) les vaut,
// pour ne pas refuser « Monique », « Pedersen », « Drapeau », « Kysha »,
// « Chatteur », « Château » ou « Retardataire ».
const EXACT_ONLY: ReadonlySet<string> = new Set(["chatte", "retard", "pd", "pede", "rape", "fdp", "ntm", "fag", "kys", "pute", "bite", "conne", "dick", "cock", "pedo", "nique"]);

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

export function normalizePseudo(pseudo: string): string {
  return pseudo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[013457@$!]/g, c => LEET[c] ?? c)
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");
}

/** Vrai si le pseudo contient une insulte de la liste. */
export function isBlockedPseudo(pseudo: string): boolean {
  const flat = normalizePseudo(pseudo);
  if (!flat) return false;
  return BLOCKED_ROOTS.some(root => {
    const r = root.replace(/(.)\1+/g, "$1");
    return EXACT_ONLY.has(root) ? flat === r : flat.includes(r);
  });
}
