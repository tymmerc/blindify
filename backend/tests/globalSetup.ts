import { resolveTestDatabaseUrl } from "./testDatabase"

// Une TEST_DATABASE_URL donnee mais dangereuse (port de la prod, base qui ne
// finit pas par _test) arrete toute la campagne avant le premier test, avec un
// seul message. Absente, les tests unitaires tournent et seuls les tests
// d'integration s'arretent (voir tests/integration/helpers).
export default async function globalSetup(): Promise<void> {
  if (process.env.TEST_DATABASE_URL !== undefined) {
    resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL)
  }
}
