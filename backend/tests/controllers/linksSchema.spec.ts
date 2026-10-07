// Schema de la bibliotheque de liens (ensureLinksSchema). Il etait rejoue a
// chaque import de carte et a chaque lancement de partie : son ALTER TABLE
// audio_sources prend un verrou ACCESS EXCLUSIVE avant de regarder si la
// colonne existe, et faisait la queue derriere la migration 005 en bloquant
// toutes les lectures d'audio_sources. Une fois par processus suffit.
// Aucune base ici : pool est un faux.

jest.mock("../../src/config/db", () => ({
  pool: { query: jest.fn() },
}));

import { pool } from "../../src/config/db";
import { ensureLinksSchema } from "../../src/controllers/linksController";

const query = pool.query as jest.Mock;

describe("ensureLinksSchema", () => {
  it("ne pose le schema qu'une fois par processus, et recommence apres un echec", async () => {
    query.mockRejectedValueOnce(new Error("connexion perdue"));
    await expect(ensureLinksSchema()).rejects.toThrow("connexion perdue");

    query.mockResolvedValue({ rows: [] });
    await Promise.all([ensureLinksSchema(), ensureLinksSchema()]);
    await ensureLinksSchema();

    const sent = query.mock.calls.map(c => String(c[0]));
    expect(sent).toHaveLength(3); // l'echec, puis CREATE TABLE + ALTER une seule fois
    expect(sent.filter(sql => sql.includes("ALTER TABLE audio_sources"))).toHaveLength(1);
  });
});
