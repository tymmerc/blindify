// Tirage des codes de defi (alerte CodeQL 18, js/biased-cryptographic-random).
// Aucune base ici : pool est remplace par un faux, et on verifie qu'il n'est
// jamais appele. Ne pas verifier ce correctif en creant un defi sur le dev :
// le backend de dev ecrit dans la base de prod.

jest.mock("../../src/config/db", () => ({
  pool: { query: jest.fn() },
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { generateCode } from "../../src/controllers/challengeController";
import { pool } from "../../src/config/db";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

describe("generateCode", () => {
  it("rend 8 caracteres par defaut, tous dans l'alphabet A-Z0-9", () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateCode()).toMatch(/^[A-Z0-9]{8}$/);
    }
  });

  it("respecte la longueur demandee", () => {
    expect(generateCode(4)).toMatch(/^[A-Z0-9]{4}$/);
    expect(generateCode(12)).toMatch(/^[A-Z0-9]{12}$/);
  });

  it("ne touche jamais a la base", () => {
    for (let i = 0; i < 100; i++) generateCode(8);
    expect(pool.query).not.toHaveBeenCalled();
  });

  // Avec l'ancien tirage (octet % 36), A, B, C et D sortaient a 8/256 au lieu
  // de 7/256 : leur frequence cumulee valait 0,125 au lieu de 4/36 = 0,1111.
  // Sur 160 000 caracteres l'ecart-type est d'environ 0,0008 : les bornes
  // 0,105-0,117 laissent passer un tirage uniforme a coup sur et attrapent
  // l'ancien a coup sur.
  it("tire chaque caractere sans biais (frequence cumulee de A a D)", () => {
    const counts = new Map<string, number>();
    let totalChars = 0;
    for (let i = 0; i < 20_000; i++) {
      for (const ch of generateCode(8)) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
        totalChars++;
      }
    }

    // Les 36 symboles sortent, et rien d'autre
    expect([...counts.keys()].sort().join("")).toBe([...ALPHABET].sort().join(""));

    const aToD = ["A", "B", "C", "D"].reduce((sum, ch) => sum + (counts.get(ch) ?? 0), 0);
    const freq = aToD / totalChars;
    expect(freq).toBeGreaterThan(0.105);
    expect(freq).toBeLessThan(0.117);
  });
});
