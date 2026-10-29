/**
 * Comptes de Tym et comptes de test, cote backend. La liste fait foi dans
 * tools/stats.sql (tableau de bord prive, comptes de test ecartes depuis #48) ;
 * tests/services/testAccounts.spec.ts casse si les deux divergent.
 *
 * Sert au mail de debut de partie (T18) : pas de mail pour une partie de Tym
 * ni pour un script de test.
 */

/** Tym quand il essaie le site (stats.sql : 10 invites, 1 compte). */
export const OWNER_PSEUDOS: readonly string[] = ["Tym"];

/** Personas des scripts E2E et outils (stats.sql, pseudos_test sans "Tym"). */
export const TEST_PSEUDOS: readonly string[] = [
  "Tymeo", "Lea", "Max", "Megane", "Zoe",
  "Intrus",
  "StreamerHost",
  "VerifA", "VerifB",
  "testplayer",
];

/** username LIKE '<prefixe>%' (sensible a la casse, comme en Postgres). */
export const TEST_PSEUDO_PREFIXES: readonly string[] = ["e2e", "audittest", "sonde-pile-"];

/** Invites Guest-xxxxxx des 09 et 10/09 crees par game-start-check.mjs. */
export const TEST_ACCOUNT_IDS: readonly number[] = [
  3339, 3340, 3341, 3342, 3347, 3348, 3349,
  3360, 3361, 3362, 3363,
];

export type AccountRef = { id: number; username: string | null | undefined };

export function isOwnerAccount(account: AccountRef): boolean {
  return typeof account.username === "string" && OWNER_PSEUDOS.includes(account.username);
}

export function isTestAccount(account: AccountRef): boolean {
  if (TEST_ACCOUNT_IDS.includes(account.id)) return true;
  const name = account.username;
  if (typeof name !== "string") return false;
  return TEST_PSEUDOS.includes(name) || TEST_PSEUDO_PREFIXES.some(prefix => name.startsWith(prefix));
}
