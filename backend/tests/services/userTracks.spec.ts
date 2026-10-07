// Application de la migration 005 au demarrage (ensureUserTracksSchema). Le
// fichier se joue en deux envois : le schema (transactions courtes), puis la
// reprise de l'existant par lots, dont le COMMIT dans le bloc DO exige qu'elle
// parte seule. Sur une base neuve, la premiere application peut etre
// interrompue (interblocage, ou lock_timeout de 3 s quand une longue requete
// tient la table) : le fichier est rejouable, on recommence.
// Aucune base ici : pool est un faux.

jest.mock("../../src/config/db", () => ({
  pool: { connect: jest.fn() },
}));

import { pool } from "../../src/config/db";
import { ensureUserTracksSchema } from "../../src/services/userTracks";

const connect = pool.connect as jest.Mock;

/** Une connexion dont la premiere requete (le debut du fichier) suit le scenario donne. */
function fakeClient(outcome: Error | null) {
  const query = jest.fn(async (sql: string) => {
    if (sql !== "ROLLBACK" && outcome) throw outcome;
    return { rows: [] };
  });
  return { query, release: jest.fn() };
}

const deadlock = () => Object.assign(new Error("deadlock detected"), { code: "40P01" });
const lockTimeout = () => Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });

describe("ensureUserTracksSchema", () => {
  // Une connexion prevue et pas consommee ne doit pas passer au test suivant.
  beforeEach(() => connect.mockReset());

  it("joue le fichier en deux envois : le schema, puis la reprise seule", async () => {
    const client = fakeClient(null);
    connect.mockResolvedValueOnce(client);

    await ensureUserTracksSchema();

    const sent = client.query.mock.calls.map(c => String(c[0]));
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("pg_advisory_xact_lock");
    expect(sent[0]).toContain("CREATE TABLE IF NOT EXISTS user_audio_sources");
    expect(sent[0]).not.toContain("INSERT INTO user_audio_sources");
    // La reprise est un seul bloc DO (COMMIT a chaque lot) : rien d'autre dans l'envoi.
    const backfill = sent[1].replace(/^\s*--.*$/gm, "").trim();
    expect(backfill.startsWith("DO $$")).toBe(true);
    expect(backfill.endsWith("$$;")).toBe(true);
    expect(backfill).toContain("INSERT INTO user_audio_sources");
    expect(backfill).toContain("COMMIT;");
    expect(client.release).toHaveBeenCalled();
  });

  it("recommence apres un interblocage, en rendant la connexion propre", async () => {
    const first = fakeClient(deadlock());
    const second = fakeClient(null);
    connect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await ensureUserTracksSchema();

    expect(first.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(first.release).toHaveBeenCalled();
    expect(second.query).toHaveBeenCalledTimes(2);
  });

  it("recommence quand une longue requete tient la table plus de 3 s (lock_timeout)", async () => {
    const first = fakeClient(lockTimeout());
    const second = fakeClient(null);
    connect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await ensureUserTracksSchema();

    expect(first.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(second.query).toHaveBeenCalledTimes(2);
  });

  it("abandonne apres trois interblocages", async () => {
    const clients = [fakeClient(deadlock()), fakeClient(deadlock()), fakeClient(deadlock())];
    clients.forEach(c => connect.mockResolvedValueOnce(c));

    await expect(ensureUserTracksSchema()).rejects.toMatchObject({ code: "40P01" });
    expect(clients.every(c => c.release.mock.calls.length === 1)).toBe(true);
  });

  it("ne recommence pas une autre erreur", async () => {
    const broken = fakeClient(Object.assign(new Error("permission denied"), { code: "42501" }));
    connect.mockResolvedValueOnce(broken);

    await expect(ensureUserTracksSchema()).rejects.toMatchObject({ code: "42501" });
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
