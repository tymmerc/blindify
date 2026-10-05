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
}

export async function withTimeoutRetry<T>(
  run: (signal: AbortSignal) => Promise<T>,
  { timeoutMs, attempts, onRetry }: TimeoutRetryOptions
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    // La course ne depend pas de `run` : meme une requete qui ignorerait le
    // signal ne peut pas bloquer l'appelant au-dela du delai.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new RequestTimeoutError(attempt))
        controller.abort()
      }, timeoutMs)
    })
    try {
      return await Promise.race([run(controller.signal), deadline])
    } catch (err) {
      const retryable = err instanceof RequestTimeoutError || err instanceof TypeError
      if (!retryable || attempt >= attempts) throw err
      onRetry?.(attempt + 1)
    } finally {
      clearTimeout(timer)
    }
  }
}
