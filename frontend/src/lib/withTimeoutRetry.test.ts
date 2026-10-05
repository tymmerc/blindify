import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/apiClient"
import { isAbortError, RequestTimeoutError, withTimeoutRetry } from "@/lib/withTimeoutRetry"

// Requete qui ne repond jamais, sauf pour dire qu'on l'a abandonnee (comme fetch).
function hanging(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
  })
}

describe("withTimeoutRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("rend la reponse du premier essai sans relancer", async () => {
    const run = vi.fn(async () => "ok")
    const onRetry = vi.fn()
    await expect(withTimeoutRetry(run, { timeoutMs: 1000, attempts: 3, onRetry })).resolves.toBe("ok")
    expect(run).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it("abandonne un essai qui ne repond pas et relance", async () => {
    const signals: AbortSignal[] = []
    const run = vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return run.mock.calls.length === 1 ? hanging(signal) : Promise.resolve("deuxieme")
    })
    const onRetry = vi.fn()
    const result = withTimeoutRetry(run, { timeoutMs: 1000, attempts: 3, onRetry })
    await vi.advanceTimersByTimeAsync(999)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe("deuxieme")
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    expect(onRetry).toHaveBeenCalledWith(2)
  })

  it("abandonne aussi une requete qui ignore le signal", async () => {
    const run = vi.fn((): Promise<string> => new Promise(() => {}))
    const result = withTimeoutRetry(run, { timeoutMs: 500, attempts: 1 })
    const check = expect(result).rejects.toBeInstanceOf(RequestTimeoutError)
    await vi.advanceTimersByTimeAsync(500)
    await check
  })

  it("relance apres une coupure reseau (TypeError de fetch), apres une courte pause", async () => {
    const run = vi.fn(async () => {
      if (run.mock.calls.length === 1) throw new TypeError("Load failed")
      return "ok"
    })
    const result = withTimeoutRetry(run, { timeoutMs: 1000, attempts: 2 })
    // Hors ligne, fetch echoue en quelques ms : relancer aussitot brulerait les
    // essais d'un coup. Pause d'environ une seconde (750 a 1250 ms, au hasard).
    await vi.advanceTimersByTimeAsync(749)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(501)
    await expect(result).resolves.toBe("ok")
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("relance sans pause apres un delai depasse (l'attente a deja eu lieu)", async () => {
    const run = vi.fn((signal: AbortSignal) => (run.mock.calls.length === 1 ? hanging(signal) : Promise.resolve("ok")))
    const result = withTimeoutRetry(run, { timeoutMs: 1000, attempts: 2 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(2)
    await expect(result).resolves.toBe("ok")
  })

  it("ne relance jamais une vraie reponse du serveur, meme une erreur", async () => {
    const run = vi.fn(async () => {
      throw new ApiError(404, "Salle introuvable", "room_not_found")
    })
    await expect(withTimeoutRetry(run, { timeoutMs: 1000, attempts: 3 })).rejects.toMatchObject({ status: 404 })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("s'arrete au dernier essai avec une erreur de delai", async () => {
    const run = vi.fn((signal: AbortSignal) => hanging(signal))
    const onRetry = vi.fn()
    const result = withTimeoutRetry(run, { timeoutMs: 1000, attempts: 3, onRetry })
    const check = expect(result).rejects.toMatchObject({ name: "RequestTimeoutError", attempts: 3 })
    await vi.advanceTimersByTimeAsync(3000)
    await check
    expect(run).toHaveBeenCalledTimes(3)
    expect(onRetry.mock.calls).toEqual([[2], [3]])
  })

  describe("abandon voulu par l'appelant (signal)", () => {
    it("coupe l'essai en cours, n'en lance aucun autre et rejette avec une AbortError", async () => {
      const signals: AbortSignal[] = []
      const run = vi.fn((signal: AbortSignal) => {
        signals.push(signal)
        return hanging(signal)
      })
      const caller = new AbortController()
      const onRetry = vi.fn()
      const result = withTimeoutRetry(run, { timeoutMs: 8000, attempts: 3, onRetry, signal: caller.signal })
      const check = expect(result).rejects.toMatchObject({ name: "AbortError" })
      await vi.advanceTimersByTimeAsync(2000)
      caller.abort()
      await check
      expect(signals[0].aborted).toBe(true)
      await vi.advanceTimersByTimeAsync(24000)
      expect(run).toHaveBeenCalledTimes(1)
      expect(onRetry).not.toHaveBeenCalled()
    })

    it("ignore une reponse arrivee apres l'abandon", async () => {
      let answer!: (value: string) => void
      const run = vi.fn(() => new Promise<string>(resolve => { answer = resolve }))
      const caller = new AbortController()
      const result = withTimeoutRetry(run, { timeoutMs: 8000, attempts: 3, signal: caller.signal })
      const check = expect(result).rejects.toSatisfy(isAbortError)
      caller.abort()
      answer("trop tard")
      await check
    })

    it("ne lance rien quand le signal est deja abandonne", async () => {
      const run = vi.fn(async () => "ok")
      const caller = new AbortController()
      caller.abort()
      await expect(withTimeoutRetry(run, { timeoutMs: 1000, attempts: 3, signal: caller.signal })).rejects.toSatisfy(isAbortError)
      expect(run).not.toHaveBeenCalled()
    })

    it("s'arrete aussi pendant la pause qui suit une coupure reseau", async () => {
      const run = vi.fn(async () => {
        throw new TypeError("Load failed")
      })
      const caller = new AbortController()
      const result = withTimeoutRetry(run, { timeoutMs: 1000, attempts: 3, signal: caller.signal })
      const check = expect(result).rejects.toSatisfy(isAbortError)
      await vi.advanceTimersByTimeAsync(300)
      caller.abort()
      await check
      await vi.advanceTimersByTimeAsync(10000)
      expect(run).toHaveBeenCalledTimes(1)
    })
  })
})

describe("isAbortError", () => {
  it("reconnait l'abandon d'un fetch et rien d'autre", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true)
    expect(isAbortError(new TypeError("Load failed"))).toBe(false)
    expect(isAbortError(new RequestTimeoutError(1))).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})
