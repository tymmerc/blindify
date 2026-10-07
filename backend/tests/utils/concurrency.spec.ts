/**
 * mapLimit : appliquer une fonction asynchrone a une liste, quelques-unes a la
 * fois seulement (les recherches d'extraits Deezer au lancement d'une salle).
 */
import { mapLimit } from "../../src/utils/concurrency";

const tick = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("mapLimit", () => {
  it("n'en fait jamais plus que la limite en meme temps", async () => {
    let running = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 40 }, (_, i) => i), 6, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick(2);
      running -= 1;
    });
    expect(peak).toBe(6);
  });

  it("rend les resultats dans l'ordre de la liste", async () => {
    const out = await mapLimit([30, 1, 20, 2], 2, async (ms, i) => {
      await tick(ms);
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3]);
  });

  it("liste vide ou limite absurde : pas de blocage", async () => {
    expect(await mapLimit([], 6, async () => 1)).toEqual([]);
    expect(await mapLimit([1, 2], 0, async x => x * 2)).toEqual([2, 4]);
  });

  it("une erreur remonte", async () => {
    await expect(mapLimit([1, 2, 3], 2, async x => {
      if (x === 2) throw new Error("boum");
      return x;
    })).rejects.toThrow("boum");
  });
});
