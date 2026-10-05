// Application de la migration 005 au demarrage (ensureUserTracksSchema). Sur
// une base neuve, la premiere application verrouille audio_sources et
// game_rounds pendant que le reste du demarrage y ecrit : Postgres peut
// l'interrompre pour interblocage (vu dans la suite d'integration, « deadlock
// detected »). Le fichier est transactionnel et rejouable : on recommence.
// Aucune base ici : pool est un faux.

jest.mock("../../src/config/db", () => ({
  pool: { connect: jest.fn() },
}));

import { pool } from "../../src/config/db";
import { ensureUserTracksSchema } from "../../src/services/userTracks";

const connect = pool.connect as jest.Mock;

/** Une connexion dont la premiere requete (le fichier) suit le scenario donne. */
function fakeClient(outcome: Error | null) {
  const query = jest.fn(async (sql: string) => {
    if (sql !== "ROLLBACK" && outcome) throw outcome;
    return { rows: [] };
  });
  return { query, release: jest.fn() };
}

const deadlock = () => Object.assign(new Error("deadlock detected"), { code: "40P01" });

describe("ensureUserTracksSchema", () => {
  it("joue le fichier de la migration 005 en une requete", async () => {
    const client = fakeClient(null);
    connect.mockResolvedValueOnce(client);

    await ensureUserTracksSchema();

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toContain("CREATE TABLE IF NOT EXISTS user_audio_sources");
    expect(client.release).toHaveBeenCalled();
  });

  it("recommence apres un interblocage, en rendant la connexion propre", async () => {
    const first = fakeClient(deadlock());
    const second = fakeClient(null);
    connect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await ensureUserTracksSchema();

    expect(first.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(first.release).toHaveBeenCalled();
    expect(second.query).toHaveBeenCalledTimes(1);
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
