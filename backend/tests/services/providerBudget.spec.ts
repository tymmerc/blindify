import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import {
  ProviderBudget,
  ProviderBudgetError,
  ProviderRateLimitedError,
  PROVIDER_BUDGET_LIMITS,
  isProviderRateLimited,
  type ProviderBudgetLimits,
} from "../../src/services/providerBudget";

// Garde commune devant les appels a Deezer et Spotify. Horloge simulee : les
// attentes de la garde sont des setTimeout, avances a la main.

const LARGE: ProviderBudgetLimits = {
  windowMs: 5_000,
  maxPerWindow: 1_000,
  minuteMs: 60_000,
  importMaxPerMinute: 1_000,
  backgroundMaxPerMinute: 1_000,
  maxConcurrentImports: 1_000,
  importMaxWaitMs: 20_000,
};

/** Un appel au fournisseur qui ne repond que quand le test le decide. */
function appelEnAttente() {
  let repondre: () => void = () => undefined;
  const promesse = new Promise<string>(resolve => { repondre = () => resolve("ok"); });
  return { appel: jest.fn(() => promesse), repondre };
}

/** Laisse tourner les promesses deja resolues (sans avancer l'horloge). */
async function vider(): Promise<void> {
  await jest.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("reglages par defaut", () => {
  it("suivent le quota de Deezer et laissent la moitie de la minute aux parties", () => {
    expect(PROVIDER_BUDGET_LIMITS).toEqual({
      windowMs: 5_000,
      maxPerWindow: 50,
      minuteMs: 60_000,
      importMaxPerMinute: 300,
      backgroundMaxPerMinute: 100,
      maxConcurrentImports: 4,
      importMaxWaitMs: 20_000,
    });
  });
});

describe("pace (tous les appels, parties comprises)", () => {
  it("ne depasse jamais la cadence, meme avec des appels simultanes", async () => {
    const budget = new ProviderBudget({ ...LARGE, maxPerWindow: 50 });
    let passes = 0;
    for (let i = 0; i < 60; i++) void budget.pace("deezer").then(() => { passes++; });

    await vider();
    expect(passes).toBe(50);
    await jest.advanceTimersByTimeAsync(4_999);
    expect(passes).toBe(50);
    await jest.advanceTimersByTimeAsync(2);
    expect(passes).toBe(60);
    expect(budget.recentCalls("deezer")).toBe(60);
  });

  it("compte chaque fournisseur a part", async () => {
    const budget = new ProviderBudget({ ...LARGE, maxPerWindow: 2 });
    await budget.pace("deezer");
    await budget.pace("deezer");
    let spotify = false;
    void budget.pace("spotify").then(() => { spotify = true; });
    await vider();
    expect(spotify).toBe(true);
  });
});

describe("runImport", () => {
  it("lance l'appel tout de suite quand rien ne tourne, et le compte", async () => {
    const budget = new ProviderBudget(LARGE);
    await expect(budget.runImport("deezer", async () => "titres")).resolves.toBe("titres");
    expect(budget.recentCalls("deezer")).toBe(1);
  });

  it("garde au plus maxConcurrentImports appels en vol, les suivants attendent leur tour", async () => {
    const budget = new ProviderBudget({ ...LARGE, maxConcurrentImports: 2 });
    const a = appelEnAttente();
    const b = appelEnAttente();
    const c = appelEnAttente();
    const resultats = [budget.runImport("deezer", a.appel), budget.runImport("deezer", b.appel), budget.runImport("deezer", c.appel)];

    await vider();
    expect(a.appel).toHaveBeenCalled();
    expect(b.appel).toHaveBeenCalled();
    expect(c.appel).not.toHaveBeenCalled();

    a.repondre();
    await vider();
    expect(c.appel).toHaveBeenCalled();
    b.repondre();
    c.repondre();
    await expect(Promise.all(resultats)).resolves.toEqual(["ok", "ok", "ok"]);
  });

  it("libere sa place meme quand l'appel echoue", async () => {
    const budget = new ProviderBudget({ ...LARGE, maxConcurrentImports: 1 });
    await expect(budget.runImport("deezer", async () => { throw new Error("HTTP 500"); })).rejects.toThrow("HTTP 500");
    await expect(budget.runImport("deezer", async () => "suivant")).resolves.toBe("suivant");
  });

  it("refuse un import qui attend sa place plus de importMaxWaitMs", async () => {
    const budget = new ProviderBudget({ ...LARGE, maxConcurrentImports: 1, importMaxWaitMs: 20_000 });
    const bloque = appelEnAttente();
    void budget.runImport("deezer", bloque.appel);
    const suivant = jest.fn(async () => "jamais");
    const refuse = budget.runImport("deezer", suivant);
    const verdict = expect(refuse).rejects.toBeInstanceOf(ProviderBudgetError);

    await jest.advanceTimersByTimeAsync(20_000);
    await verdict;
    expect(suivant).not.toHaveBeenCalled();
    bloque.repondre();
  });

  it("un import refuse ne bloque pas la file : le suivant passe quand la place se libere", async () => {
    const budget = new ProviderBudget({ ...LARGE, maxConcurrentImports: 1, importMaxWaitMs: 1_000 });
    const bloque = appelEnAttente();
    void budget.runImport("deezer", bloque.appel);
    const refuse = expect(budget.runImport("deezer", async () => "trop tard")).rejects.toBeInstanceOf(ProviderBudgetError);
    await jest.advanceTimersByTimeAsync(1_000);
    await refuse;

    const apres = budget.runImport("deezer", async () => "a temps");
    bloque.repondre();
    await expect(apres).resolves.toBe("a temps");
  });

  it("n'accepte plus d'import quand la minute compte importMaxPerMinute appels, puis reprend", async () => {
    const budget = new ProviderBudget({ ...LARGE, importMaxPerMinute: 3, importMaxWaitMs: 20_000 });
    for (let i = 0; i < 3; i++) await budget.runImport("deezer", async () => i);

    // Rien ne se libere avant 60 s, plus que l'attente maximale : refus net,
    // sans attendre pour rien.
    const quatrieme = jest.fn(async () => "plus tard");
    await expect(budget.runImport("deezer", quatrieme)).rejects.toBeInstanceOf(ProviderBudgetError);
    expect(quatrieme).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(45_000);
    // Les 3 premiers appels sortent de la minute dans 15 s : on attend.
    const cinquieme = budget.runImport("deezer", async () => "repris");
    await jest.advanceTimersByTimeAsync(15_001);
    await expect(cinquieme).resolves.toBe("repris");
  });

  it("les appels des parties comptent dans la minute des imports (les parties passent d'abord)", async () => {
    const budget = new ProviderBudget({ ...LARGE, importMaxPerMinute: 2, importMaxWaitMs: 0 });
    await budget.pace("deezer");
    await budget.pace("deezer");
    await expect(budget.runImport("deezer", async () => "import")).rejects.toBeInstanceOf(ProviderBudgetError);
    // Une partie, elle, passe toujours (seule la cadence de 5 s la retient).
    await expect(budget.pace("deezer")).resolves.toBeUndefined();
  });

  it("respecte aussi la cadence de 5 s commune avec les parties", async () => {
    const budget = new ProviderBudget({ ...LARGE, maxPerWindow: 2 });
    await budget.pace("deezer");
    await budget.pace("deezer");
    const appel = jest.fn(async () => "import");
    const enAttente = budget.runImport("deezer", appel);
    await vider();
    expect(appel).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(5_001);
    await expect(enAttente).resolves.toBe("import");
  });
});

describe("hasBackgroundRoom (pre-chargement des extraits)", () => {
  it("n'autorise le travail de fond que si la minute est calme", async () => {
    const budget = new ProviderBudget({ ...LARGE, backgroundMaxPerMinute: 2 });
    expect(budget.hasBackgroundRoom("deezer")).toBe(true);
    await budget.pace("deezer");
    await budget.pace("deezer");
    expect(budget.hasBackgroundRoom("deezer")).toBe(false);
    expect(budget.hasBackgroundRoom("spotify")).toBe(true);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(budget.hasBackgroundRoom("deezer")).toBe(true);
  });
});

describe("isProviderRateLimited", () => {
  it("reconnait un 429 HTTP et le quota de Deezer, rien d'autre", () => {
    expect(isProviderRateLimited(new ProviderRateLimitedError("deezer"))).toBe(true);
    expect(isProviderRateLimited({ response: { status: 429 } })).toBe(true);
    expect(isProviderRateLimited({ response: { status: 403 } })).toBe(false);
    expect(isProviderRateLimited(new Error("HTTP 429"))).toBe(false);
    expect(isProviderRateLimited(undefined)).toBe(false);
  });
});
