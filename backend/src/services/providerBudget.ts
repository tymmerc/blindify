/**
 * Garde commune devant les appels a Deezer et Spotify, pour tout le processus
 * (relecture de la PR #34, 05/10/2026).
 *
 * Deezer (Akamai) bloque l'adresse du VPS quand elle depasse son quota (50
 * requetes par 5 secondes) : l'import ET les extraits des parties tombent
 * alors pour tous les joueurs, pendant des heures (vu deux fois en 08/2026).
 * La limite par adresse de routes/import.ts ne suffit pas : 60 requetes de 200
 * playlists depuis une adresse, ou quelques adresses, depassent ce quota.
 *
 * Trois niveaux, du plus prioritaire au moins prioritaire :
 * - les parties (extraits, deezerPreviewService) passent par pace() : 50
 *   appels par 5 s au plus, jamais refuses, seulement retardes ;
 * - les imports (une playlist de 50 titres au plus = un appel) passent par
 *   runImport() : 4 en vol au plus, et seulement tant que la derniere minute
 *   compte moins de 300 appels au fournisseur, parties comprises (la moitie du
 *   quota de Deezer). Ils attendent leur tour 20 s au plus, puis sont refuses
 *   (ProviderBudgetError) : l'appelant arrete sa boucle ;
 * - le pre-chargement des extraits apres un import ne tourne que si la
 *   minute compte moins de 100 appels (hasBackgroundRoom).
 */

export type Provider = "deezer" | "spotify";

export interface ProviderBudgetLimits {
  /** Fenetre courte : le quota de Deezer est de 50 appels par 5 s. */
  windowMs: number;
  maxPerWindow: number;
  minuteMs: number;
  /** Les imports ne passent que si la minute compte moins d'appels que ca. */
  importMaxPerMinute: number;
  /** Le pre-chargement en tache de fond, seulement sous ce seuil. */
  backgroundMaxPerMinute: number;
  maxConcurrentImports: number;
  /** Au-dela, un import qui attend sa place ou son tour est refuse. */
  importMaxWaitMs: number;
}

export const PROVIDER_BUDGET_LIMITS: Readonly<ProviderBudgetLimits> = Object.freeze({
  windowMs: 5_000,
  maxPerWindow: 50,
  minuteMs: 60_000,
  importMaxPerMinute: 300,
  backgroundMaxPerMinute: 100,
  maxConcurrentImports: 4,
  importMaxWaitMs: 20_000,
});

/** La garde refuse un import (trop d'attente) : arreter la boucle, reessayer plus tard. */
export class ProviderBudgetError extends Error {
  constructor(readonly provider: Provider) {
    super(`provider_budget_exhausted:${provider}`);
    this.name = "ProviderBudgetError";
  }
}

/** Le fournisseur demande de ralentir (HTTP 429, ou quota de Deezer, code 4). */
export class ProviderRateLimitedError extends Error {
  constructor(readonly provider: Provider) {
    super(`provider_rate_limited:${provider}`);
    this.name = "ProviderRateLimitedError";
  }
}

/** Vrai pour une limite de debit du fournisseur, quelle que soit sa forme. */
export function isProviderRateLimited(err: unknown): boolean {
  if (err instanceof ProviderRateLimitedError) return true;
  const status = (err as { response?: { status?: unknown } } | null | undefined)?.response?.status;
  return status === 429;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Millisecondes avant que la fenetre compte moins de `max` appels (0 : deja
 * le cas). `stamps` est trie du plus ancien au plus recent.
 */
function msUntilBelow(stamps: readonly number[], now: number, windowMs: number, max: number): number {
  const recent = stamps.filter(ts => now - ts < windowMs);
  if (recent.length < max) return 0;
  // Il faut que les (n - max + 1) plus anciens sortent de la fenetre.
  return Math.max(1, recent[recent.length - max] + windowMs - now);
}

interface Waiter {
  grant: () => void;
}

export class ProviderBudget {
  private calls: Readonly<Record<Provider, readonly number[]>> = { deezer: [], spotify: [] };
  private inFlight = 0;
  private queue: readonly Waiter[] = [];

  constructor(private readonly limits: Readonly<ProviderBudgetLimits> = PROVIDER_BUDGET_LIMITS) {}

  /** Appels notes sur la derniere minute (journaux, tests). */
  recentCalls(provider: Provider): number {
    const now = Date.now();
    return this.calls[provider].filter(ts => now - ts < this.limits.minuteMs).length;
  }

  /** Tout appel (parties comprises) : attend une place dans la fenetre courte, puis le note. */
  async pace(provider: Provider): Promise<void> {
    for (;;) {
      const wait = msUntilBelow(this.calls[provider], Date.now(), this.limits.windowMs, this.limits.maxPerWindow);
      if (wait === 0) break;
      await sleep(wait);
    }
    this.note(provider);
  }

  /** Import : une place parmi les imports en vol, de la marge dans la minute, puis l'appel. */
  async runImport<T>(provider: Provider, call: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + this.limits.importMaxWaitMs;
    await this.acquire(provider, deadline);
    try {
      await this.waitForImportRoom(provider, deadline);
      this.note(provider);
      return await call();
    } finally {
      this.release();
    }
  }

  /** Pre-chargement en tache de fond : seulement quand la minute est calme. */
  hasBackgroundRoom(provider: Provider): boolean {
    return this.recentCalls(provider) < this.limits.backgroundMaxPerMinute;
  }

  private note(provider: Provider): void {
    const now = Date.now();
    const kept = this.calls[provider].filter(ts => now - ts < this.limits.minuteMs);
    this.calls = { ...this.calls, [provider]: [...kept, now] };
  }

  /** Attend la cadence de 5 s ET la marge de la minute ; refuse si l'attente depasse l'echeance. */
  private async waitForImportRoom(provider: Provider, deadline: number): Promise<void> {
    for (;;) {
      const now = Date.now();
      const stamps = this.calls[provider];
      const wait = Math.max(
        msUntilBelow(stamps, now, this.limits.windowMs, this.limits.maxPerWindow),
        msUntilBelow(stamps, now, this.limits.minuteMs, this.limits.importMaxPerMinute),
      );
      if (wait === 0) return;
      if (now + wait > deadline) throw new ProviderBudgetError(provider);
      await sleep(wait);
    }
  }

  private acquire(provider: Provider, deadline: number): Promise<void> {
    if (this.inFlight < this.limits.maxConcurrentImports) {
      this.inFlight++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        grant: () => {
          clearTimeout(timer);
          resolve();
        },
      };
      const timer = setTimeout(() => {
        this.queue = this.queue.filter(w => w !== waiter);
        reject(new ProviderBudgetError(provider));
      }, Math.max(0, deadline - Date.now()));
      this.queue = [...this.queue, waiter];
    });
  }

  /** La place passe au premier qui attend, sinon elle se libere. */
  private release(): void {
    const [next, ...rest] = this.queue;
    if (next) {
      this.queue = rest;
      next.grant();
      return;
    }
    this.inFlight--;
  }
}

/** La garde du processus, partagee par l'import et deezerPreviewService. */
export const providerBudget = new ProviderBudget();
