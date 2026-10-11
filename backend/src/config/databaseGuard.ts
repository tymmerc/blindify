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
 * Deux verrous :
 * - avant le pool (config/db.ts), le nom que pg ouvrira, lu par pg lui-meme
 *   (pg/lib/connection-parameters : chemin, ?user=, socket:?db=, PGDATABASE,
 *   PGUSER, USER). Ne pas reecrire ce parseur : la relecture de #75 a trouve
 *   trois adresses ou une lecture maison et celle de pg divergeaient ;
 * - apres la premiere connexion (index.ts), la reponse du serveur,
 *   `SELECT current_database()`, avant tout schema.
 *
 * Seul le conteneur de prod (NODE_ENV=production) a le droit d'ouvrir
 * `blindify`. La pile de test et la CI tournent sur des bases *_test.
 *
 * Code de sortie 78 (EX_CONFIG) : l'unite systemd du dev ne relance pas
 * (RestartPreventExitStatus=78), un refus ne tourne pas en boucle.
 *
 * Les messages ne recopient jamais l'adresse : elle contient un mot de passe.
 */
import ConnectionParameters from "pg/lib/connection-parameters"

export const PROD_DATABASE = "blindify"
export const GUARD_EXIT_CODE = 78

export interface DatabaseTarget {
  nodeEnv: string | undefined
  databaseUrl: string | undefined
}

/** Nom de la base que pg ouvrira pour cette adresse, ou null s'il ne la lit pas. */
export function targetDatabaseName(databaseUrl: string | undefined): string | null {
  try {
    return new ConnectionParameters({ connectionString: databaseUrl }).database ?? null
  } catch {
    return null
  }
}

/** Message d'erreur si la base nommee est interdite pour ce NODE_ENV, null sinon. */
export function checkDatabaseName(nodeEnv: string | undefined, name: string): string | null {
  if (nodeEnv === "production") return null
  if (name.toLowerCase() !== PROD_DATABASE) return null
  return `Base "${name}" refusee hors production (NODE_ENV=${nodeEnv || "absent"}) : `
    + `c'est la base de prod. Le dev utilise blindify_dev (docs/BASE-DEV.md).`
}

/** Message d'erreur si le demarrage doit etre refuse, null sinon. */
export function checkDatabaseTarget(target: DatabaseTarget): string | null {
  if (target.nodeEnv === "production") return null
  const name = targetDatabaseName(target.databaseUrl)
  if (name === null) {
    return "DATABASE_URL illisible : impossible de verifier qu'elle ne vise pas la base de prod."
  }
  return checkDatabaseName(target.nodeEnv, name)
}

function refuse(error: string): never {
  // Pas de logger ici : il est configure plus tard, et ce message doit
  // sortir quoi qu'il arrive (journal systemd).
  console.error(`[database_guard] ${error}`)
  return process.exit(GUARD_EXIT_CODE)
}

/** Arrete le processus si la base visee est interdite. Appele avant le pool. */
export function assertDatabaseTarget(env: NodeJS.ProcessEnv = process.env): void {
  const error = checkDatabaseTarget({ nodeEnv: env.NODE_ENV, databaseUrl: env.DATABASE_URL })
  if (error) refuse(error)
}

interface Queryable {
  query: (sql: string) => Promise<{ rows: Array<{ db?: string }> }>
}

/** Second verrou : la base reellement ouverte, d'apres le serveur. */
export async function assertConnectedDatabase(
  db: Queryable,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const { rows } = await db.query("SELECT current_database() AS db")
  const error = checkDatabaseName(env.NODE_ENV, String(rows[0]?.db ?? ""))
  if (error) refuse(error)
}
