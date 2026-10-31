// Comptes de Tym et comptes de test, pour le mail de debut de partie (T18).
// La liste fait foi dans tools/stats.sql (tableau de bord, #48) : ce test
// casse si les deux divergent.
import fs from "fs";
import path from "path";
import {
  OWNER_PSEUDOS,
  TEST_ACCOUNT_IDS,
  TEST_PSEUDOS,
  TEST_PSEUDO_PREFIXES,
  isOwnerAccount,
  isTestAccount,
} from "../../src/services/testAccounts";

const STATS_SQL = path.resolve(__dirname, "../../../tools/stats.sql");

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = text.indexOf(end, from + start.length);
  return text.slice(from + start.length, to);
}

describe("meme liste que le tableau de bord (tools/stats.sql)", () => {
  const sql = fs.readFileSync(STATS_SQL, "utf8").replace(/--.*$/gm, "");

  it("pseudos", () => {
    const block = between(sql, "pseudos_test(pseudo) AS (VALUES", "\n),");
    const pseudos = [...block.matchAll(/\('([^']+)'\)/g)].map(m => m[1]).sort();
    expect([...TEST_PSEUDOS, ...OWNER_PSEUDOS].sort()).toEqual(pseudos);
  });

  it("identifiants", () => {
    const block = between(sql, "ids_test(id) AS (VALUES", "\n),");
    const ids = [...block.matchAll(/\((\d+)\)/g)].map(m => Number(m[1])).sort((a, b) => a - b);
    expect([...TEST_ACCOUNT_IDS].sort((a, b) => a - b)).toEqual(ids);
  });

  it("prefixes (LIKE 'xxx%')", () => {
    const block = between(sql, "comptes_test AS (", "\n),");
    const prefixes = [...block.matchAll(/LIKE '([^'%]+)%'/g)].map(m => m[1]).sort();
    expect([...TEST_PSEUDO_PREFIXES].sort()).toEqual(prefixes);
  });
});

describe("isOwnerAccount", () => {
  it("Tym, pseudo exact comme dans les stats", () => {
    expect(isOwnerAccount({ id: 1, username: "Tym" })).toBe(true);
    expect(isOwnerAccount({ id: 1, username: "Tymeo" })).toBe(false);
    expect(isOwnerAccount({ id: 1, username: null })).toBe(false);
  });
});

describe("isTestAccount", () => {
  it("pseudos des scripts, prefixes, identifiants", () => {
    expect(isTestAccount({ id: 9, username: "Lea" })).toBe(true);
    expect(isTestAccount({ id: 9, username: "e2e_host_1" })).toBe(true);
    expect(isTestAccount({ id: 9, username: "sonde-pile-123" })).toBe(true);
    expect(isTestAccount({ id: 3340, username: "Guest-a1b2c3" })).toBe(true);
  });
  it("un vrai joueur ne l'est pas, y compris un Guest-xxxx anonyme", () => {
    expect(isTestAccount({ id: 9, username: "Julie" })).toBe(false);
    expect(isTestAccount({ id: 9, username: "Guest-a1b2c3" })).toBe(false);
    expect(isTestAccount({ id: 9, username: null })).toBe(false);
    // Sensible a la casse, comme LIKE en Postgres.
    expect(isTestAccount({ id: 9, username: "E2E_maj" })).toBe(false);
  });
});
