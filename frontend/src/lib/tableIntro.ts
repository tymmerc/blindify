/**
 * Autour d'une table, avant la 1re manche de la 1re partie de la salle : le
 * serveur laisse quelques secondes de plus avant le 3-2-1 (state.tableIntro,
 * ROUND_PACING.tableIntroMs cote serveur) pour dire ou sort la musique et ou
 * on repond. Le 24/11, trois nouveaux venus n'avaient rien tape en quatre manches.
 */
export type TableIntro = { lead: string; body: string }

/** Qui regarde : l'hote qui presente, l'hote qui joue aussi, ou un joueur a son telephone. */
export type TableViewer = "presenter" | "hostPlays" | "phone"

const SCORING = "Un des deux suffit pour marquer."

export function tableIntro(viewer: TableViewer): TableIntro {
  if (viewer === "presenter") {
    return { lead: "La musique va sortir de cet écran.", body: `Chacun tape le titre ou l'artiste sur son téléphone, puis valide. ${SCORING}` }
  }
  if (viewer === "hostPlays") {
    return { lead: "La musique va sortir de cet appareil.", body: `Tu tapes ici le titre ou l'artiste, les autres sur leur téléphone. ${SCORING}` }
  }
  return { lead: "La musique sort du grand écran.", body: `Tape ici le titre ou l'artiste, puis valide. ${SCORING}` }
}
