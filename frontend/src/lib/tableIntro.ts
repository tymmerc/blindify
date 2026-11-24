/**
 * Autour d'une table, avant la 1re manche : le serveur laisse quelques
 * secondes de plus avant le 3-2-1 (ROUND_PACING.tableIntroMs cote serveur)
 * pour dire ou sort la musique et ou on repond. Le 24/11, trois nouveaux
 * venus n'avaient rien tape en quatre manches.
 */
export type TableIntro = { lead: string; body: string }

/** Le texte de l'ecran de la table (l'hote) ou d'un telephone de joueur. */
export function tableIntro(onScreen: boolean): TableIntro {
  return onScreen
    ? { lead: "La musique va sortir de cet écran.", body: "Chacun tape le titre ou l'artiste sur son téléphone, puis valide. Un des deux suffit pour marquer." }
    : { lead: "La musique sort du grand écran.", body: "Tape ici le titre ou l'artiste, puis valide. Un des deux suffit pour marquer." }
}
