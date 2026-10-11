/**
 * Garde-fou de la base visee au demarrage.
 *
 * Jusqu'a octobre 2026, le backend de dev (service blindify-dev-backend) visait
 * la base de prod `blindify` et y appliquait du schema a chaque redemarrage
 * (migration 005, ensure*, index). Frole le 01/10 et le 07/10. Depuis C0, le
 * dev a sa propre base (blindify_dev, conteneur a part) et ce garde-fou rend
 * l'erreur impossible a refaire par une variable oubliee :
 *
 *   hors production (NODE_ENV absent, development, test...), un backend qui
 *   vise une base nommee `blindify` refuse de demarrer.
 *
 * Seul le conteneur de prod (NODE_ENV=production) a le droit d'ouvrir
 * `blindify`. La pile de test et la CI tournent sur des bases *_test.
 *
 * Sans DATABASE_URL, pg lit PGDATABASE puis PGUSER : on applique la meme regle
 * a ce qu'il choisirait.
 *
 * Les messages ne recopient jamais l'adresse : elle contient un mot de passe.
 */

export const PROD_DATABASE = "blindify"

export interface DatabaseTarget {
  nodeEnv: string | undefined
  databaseUrl: string | undefined
  pgDatabase?: string | undefined
  pgUser?: string | undefined
}

/** Nom de la base que pg ouvrira, ou null si on ne sait pas le dire. */
export function targetDatabaseName(target: DatabaseTarget): string | null {
  if (target.databaseUrl) {
    try {
      const url = new URL(target.databaseUrl)
      const fromPath = decodeURIComponent(url.pathname.replace(/^\//, ""))
      // pg accepte aussi ?database=... ; sans nom dans le chemin, pg retombe
      // sur PGDATABASE puis sur l'utilisateur de l'adresse.
      return fromPath
        || url.searchParams.get("database")
        || target.pgDatabase
        || decodeURIComponent(url.username)
        || target.pgUser
        || null
    } catch {
      return null
    }
  }
  return target.pgDatabase || target.pgUser || null
}

/** Message d'erreur si le demarrage doit etre refuse, null sinon. */
export function checkDatabaseTarget(target: DatabaseTarget): string | null {
  if (target.nodeEnv === "production") return null

  const name = targetDatabaseName(target)
  if (name === null) {
    if (target.databaseUrl) {
      return "DATABASE_URL illisible : impossible de verifier qu'elle ne vise pas la base de prod."
    }
    return null
  }

  if (name.toLowerCase() === PROD_DATABASE) {
    return `Base "${name}" refusee hors production (NODE_ENV=${target.nodeEnv ?? "absent"}) : `
      + `c'est la base de prod. Le dev utilise blindify_dev (docs/BASE-DEV.md).`
  }
  return null
}

/** Arrete le processus si la base visee est interdite. Appele avant le pool. */
export function assertDatabaseTarget(env: NodeJS.ProcessEnv = process.env): void {
  const error = checkDatabaseTarget({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    pgDatabase: env.PGDATABASE,
    pgUser: env.PGUSER,
  })
  if (error) {
    // Pas de logger ici : il est configure plus tard, et ce message doit
    // sortir quoi qu'il arrive (journal systemd).
    console.error(`[database_guard] ${error}`)
    process.exit(1)
  }
}
