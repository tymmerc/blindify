/**
 * Garde-fou de la base des tests.
 *
 * Jusqu'au 01/10/2026, tests/setup.ts visait par defaut blindify_test sur
 * localhost:5432 : le serveur Postgres de la prod sur le VPS (meme instance,
 * autre base). Une variable oubliee et les tests d'integration ecrivaient a
 * cote des vraies donnees. Il n'y a plus de defaut. TEST_DATABASE_URL doit :
 * - etre donnee explicitement ;
 * - viser une base dont le nom finit par _test ;
 * - utiliser un port explicite autre que 5432, celui de la prod.
 *
 * La base jetable de `npm run test:db` ecoute sur 5437, en local comme en CI.
 * Les messages ne recopient jamais l'adresse : elle contient un mot de passe.
 */

const PROD_PORT = "5432"

const HOWTO =
  "Lance `npm run test:db`, puis " +
  "`TEST_DATABASE_URL=postgres://blindz:blindz@127.0.0.1:5437/blindz_test npm test` " +
  "(voir le README, section Tests)."

export function resolveTestDatabaseUrl(raw: string | undefined): string {
  if (!raw) {
    throw new Error(`TEST_DATABASE_URL manquante : les tests d'integration ont besoin d'une base de test jetable. ${HOWTO}`)
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`TEST_DATABASE_URL illisible. ${HOWTO}`)
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`TEST_DATABASE_URL doit commencer par postgres://. ${HOWTO}`)
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""))
  if (!database.endsWith("_test")) {
    throw new Error(`Base "${database || "(aucune)"}" refusee : le nom d'une base de test finit par _test. ${HOWTO}`)
  }

  // Sans port dans l'adresse, Postgres prend 5432.
  if ((url.port || PROD_PORT) === PROD_PORT) {
    throw new Error(`Port 5432 refuse : c'est celui du Postgres de la prod sur le VPS. La base de test vit sur un autre port. ${HOWTO}`)
  }

  return raw
}
