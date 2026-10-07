import { describe, expect, it, vi } from "vitest"
import { runExclusive } from "./runExclusive"

describe("runExclusive", () => {
  it("un 2e clic pendant que le 1er tourne ne relance rien", async () => {
    let finish: () => void = () => {}
    const run = vi.fn(() => new Promise<string>(resolve => { finish = () => resolve("ok") }))
    const flag = { current: false }

    const first = runExclusive(flag, run)
    const second = runExclusive(flag, run)
    finish()

    expect(await first).toBe("ok")
    expect(await second).toBeUndefined()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("une fois fini (meme en erreur), on peut relancer", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("refus")).mockResolvedValueOnce("ok")
    const flag = { current: false }

    await expect(runExclusive(flag, run)).rejects.toThrow("refus")
    expect(await runExclusive(flag, run)).toBe("ok")
    expect(run).toHaveBeenCalledTimes(2)
  })
})
