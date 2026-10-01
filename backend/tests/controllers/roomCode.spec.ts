// Tirage des codes de salle. Math.random est previsible des qu'on observe
// assez de tirages (generateur xorshift128+ de V8) : un code de salle permet
// de rejoindre une partie, il passe donc par crypto.randomInt, comme les codes
// de defi. Aucune base ici : pool est remplace par un faux.

jest.mock("../../src/config/db", () => ({
  pool: { query: jest.fn() },
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import crypto from "crypto";
import { generateRoomCode } from "../../src/controllers/roomsController";

describe("generateRoomCode", () => {
  it("rend 6 caracteres de l'alphabet sans 0, O, 1 ni I", () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it("tire avec crypto.randomInt, pas Math.random", () => {
    const randomInt = jest.spyOn(crypto, "randomInt");
    const mathRandom = jest.spyOn(Math, "random");
    generateRoomCode();
    expect(randomInt).toHaveBeenCalledTimes(6);
    expect(mathRandom).not.toHaveBeenCalled();
    randomInt.mockRestore();
    mathRandom.mockRestore();
  });
});
