import { describe, expect, it } from "vitest"
import { countUnread, lastStamp } from "./chatUnread"

const msg = (userId: number, timestamp: number) => ({ userId, timestamp })

describe("chatUnread", () => {
  it("compte les messages des autres arrives apres le dernier vu", () => {
    const fil = [msg(2, 100), msg(3, 200), msg(1, 300), msg(2, 400)]
    expect(countUnread(fil, 200, 1)).toBe(1)
    expect(countUnread(fil, 0, 1)).toBe(3)
    expect(countUnread(fil, 400, 1)).toBe(0)
  })

  it("ne compte jamais ses propres messages", () => {
    expect(countUnread([msg(1, 500), msg(1, 600)], 0, 1)).toBe(0)
  })

  it("continue de compter quand le fil plein perd ses plus vieux messages", () => {
    const plein = Array.from({ length: 100 }, (_, i) => msg(2, i + 1))
    const seen = lastStamp(plein)
    const apres = [...plein, msg(2, 101), msg(3, 102)].slice(-100)
    expect(apres).toHaveLength(100)
    expect(countUnread(apres, seen, 1)).toBe(2)
  })

  it("lastStamp vaut 0 sur un fil vide", () => {
    expect(lastStamp([])).toBe(0)
    expect(lastStamp([msg(2, 42)])).toBe(42)
  })
})
