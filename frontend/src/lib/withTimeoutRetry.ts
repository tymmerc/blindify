/**
 * Requete relancee quand elle ne repond pas a temps.
 *
 * Sans delai, un fetch perdu (wifi de bar, telephone qui coupe la connexion,
 * onglet fige puis repris) attend indefiniment : l'entree dans un salon restait
 * alors sur "Preparation du lobby" sans rien proposer. Ici chaque essai a son
 * delai ; une fois depasse, la requete est abandonnee (AbortController) et
 * relancee. Une vraie reponse du serveur, meme une erreur HTTP, n'est jamais
 * relancee : seuls le delai depasse et la coupure reseau (TypeError de fetch)
 * le sont. La requete doit donc pouvoir etre rejouee sans effet de bord.
 *
 * L'appelant peut tout arreter avec `signal` (joueur reparti, page quittee) :
 * l'essai en cours est coupe, aucun autre ne part, et l'appel rejette avec une
 * AbortError, meme si une reponse arrive ensuite.
 */
export class RequestTimeoutError extends Error {
  constructor(readonly attempts: number) {
    super("La requete n'a pas abouti a temps")
    this.name = "RequestTimeoutError"
  }
}

export type TimeoutRetryOptions = {
  /** Delai d'un essai, en ms. */
  timeoutMs: number
  /** Nombre total d'essais (1 = aucune relance). */
  attempts: number
  /** Appele juste avant chaque relance, avec le numero de l'essai qui part (2, 3...). */
  onRetry?: (attempt: number) => void
  /** Arret voulu par l'appelant : plus aucun essai, rejet avec une AbortError. */
  signal?: AbortSignal
  /** Pause avant de relancer apres une coupure reseau, en ms (defaut 1000, plus ou moins 25 % au hasard). */
  retryDelayMs?: number
}

const NETWORK_RETRY_DELAY_MS = 1000

/** Vrai pour l'abandon d'une requete (fetch coupe par son signal, ou arret de withTimeoutRetry). */
export function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError"
}

function abortError(): DOMException {
  return new DOMException("La requete a ete abandonnee", "AbortError")
}

// Pause interrompue des que l'appelant abandonne.
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

async function attemptOnce<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  attempt: number,
  signal?: AbortSignal
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  // La course ne depend pas de `run` : meme une requete qui ignorerait le
  // signal ne peut pas bloquer l'appelant au-dela du delai, ni apres un abandon.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestTimeoutError(attempt))
      controller.abort()
    }, timeoutMs)
  })
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(abortError())
      controller.abort()
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
  try {
    return await Promise.race([run(controller.signal), deadline, cancelled])
  } finally {
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener("abort", onAbort)
  }
}

export async function withTimeoutRetry<T>(
  run: (signal: AbortSignal) => Promise<T>,
  { timeoutMs, attempts, onRetry, signal, retryDelayMs = NETWORK_RETRY_DELAY_MS }: TimeoutRetryOptions
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw abortError()
    try {
      return await attemptOnce(run, timeoutMs, attempt, signal)
    } catch (err) {
      if (signal?.aborted) throw abortError()
      const timedOut = err instanceof RequestTimeoutError
      if (!(timedOut || err instanceof TypeError) || attempt >= attempts) throw err
      // Hors ligne (ou "Load failed" de Safari), fetch echoue en quelques ms :
      // relancer aussitot brulerait tous les essais d'un coup. Apres un delai
      // depasse, l'attente a deja eu lieu.
      if (!timedOut) await pause(retryDelayMs * (0.75 + Math.random() * 0.5), signal)
      onRetry?.(attempt + 1)
    }
  }
}
