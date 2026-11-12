// Bornes du disjoncteur : celles du lancement d'une salle par defaut, d'autres
// pour l'import YouTube (plus long, sous les 60 s de nginx).
import { afterEach, describe, expect, it } from "@jest/globals";
import { LookupGuard, START_LIMITS } from "../../src/services/lookupGuard";

const DEFAULTS = { ...START_LIMITS };
afterEach(() => { Object.assign(START_LIMITS, DEFAULTS); });

describe("LookupGuard", () => {
  it("sans reglage : les bornes du lancement", () => {
    const guard = new LookupGuard(10);
    expect(guard.timeoutMs()).toBe(START_LIMITS.lookupTimeoutMs);
    expect(guard.remainingMs()).toBeLessThanOrEqual(START_LIMITS.deadlineMs);
    for (let i = 0; i < START_LIMITS.breakerFailures; i++) guard.failed();
    expect(guard.stoppedBy).toBe("breaker");
  });

  it("avec ses bornes : echeance, delai et disjoncteur propres", () => {
    const guard = new LookupGuard(10, Date.now(), { deadlineMs: 30_000, lookupTimeoutMs: 6_000, breakerFailures: 2 });
    expect(guard.remainingMs()).toBeGreaterThan(START_LIMITS.deadlineMs);
    expect(guard.timeoutMs()).toBe(6_000);
    guard.failed();
    expect(guard.stoppedBy).toBeNull();
    guard.failed();
    expect(guard.stoppedBy).toBe("breaker");
    expect(guard.take()).toBe(false);
  });

  it("une borne non reglee suit START_LIMITS, meme changee apres coup (tests)", () => {
    const guard = new LookupGuard(10, Date.now(), { deadlineMs: 30_000 });
    START_LIMITS.lookupTimeoutMs = 123;
    expect(guard.timeoutMs()).toBe(123);
  });
});
