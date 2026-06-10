import { describe, it, expect } from "vitest"
import { getListeningDuration } from "./progressiveDifficulty"

describe("getListeningDuration", () => {
  describe("with 9 rounds (evenly divisible by 3)", () => {
    const total = 9

    it("returns 30s for rounds 1-3 (indices 0-2)", () => {
      expect(getListeningDuration(0, total)).toBe(30)
      expect(getListeningDuration(1, total)).toBe(30)
      expect(getListeningDuration(2, total)).toBe(30)
    })

    it("returns 20s for rounds 4-6 (indices 3-5)", () => {
      expect(getListeningDuration(3, total)).toBe(20)
      expect(getListeningDuration(4, total)).toBe(20)
      expect(getListeningDuration(5, total)).toBe(20)
    })

    it("returns 10s for rounds 7-9 (indices 6-8)", () => {
      expect(getListeningDuration(6, total)).toBe(10)
      expect(getListeningDuration(7, total)).toBe(10)
      expect(getListeningDuration(8, total)).toBe(10)
    })
  })

  describe("with 5 rounds (not evenly divisible by 3)", () => {
    const total = 5

    it("returns 30s for rounds 1-2 (indices 0-1)", () => {
      expect(getListeningDuration(0, total)).toBe(30)
      expect(getListeningDuration(1, total)).toBe(30)
    })

    it("returns 20s for rounds 3-4 (indices 2-3)", () => {
      expect(getListeningDuration(2, total)).toBe(20)
      expect(getListeningDuration(3, total)).toBe(20)
    })

    it("returns 10s for round 5 (index 4)", () => {
      expect(getListeningDuration(4, total)).toBe(10)
    })
  })

  describe("with 1 round", () => {
    it("returns 30s for the only round", () => {
      expect(getListeningDuration(0, 1)).toBe(30)
    })
  })

  describe("with 2 rounds", () => {
    it("returns 30s for the first round", () => {
      expect(getListeningDuration(0, 2)).toBe(30)
    })

    it("returns 20s for the second round (falls in second third)", () => {
      expect(getListeningDuration(1, 2)).toBe(20)
    })
  })

  describe("with 3 rounds", () => {
    it("returns 30s for round 1", () => {
      expect(getListeningDuration(0, 3)).toBe(30)
    })

    it("returns 20s for round 2", () => {
      expect(getListeningDuration(1, 3)).toBe(20)
    })

    it("returns 10s for round 3", () => {
      expect(getListeningDuration(2, 3)).toBe(10)
    })
  })

  describe("with 10 rounds", () => {
    const total = 10
    // thirdSize = 3.333, so indices 0-3 < 3.333 -> 30s, 4-6 < 6.667 -> 20s, 7-9 -> 10s

    it("returns 30s for rounds 1-4 (indices 0-3)", () => {
      expect(getListeningDuration(0, total)).toBe(30)
      expect(getListeningDuration(1, total)).toBe(30)
      expect(getListeningDuration(2, total)).toBe(30)
      expect(getListeningDuration(3, total)).toBe(30)
    })

    it("returns 20s for rounds 5-7 (indices 4-6)", () => {
      expect(getListeningDuration(4, total)).toBe(20)
      expect(getListeningDuration(5, total)).toBe(20)
      expect(getListeningDuration(6, total)).toBe(20)
    })

    it("returns 10s for rounds 8-10 (indices 7-9)", () => {
      expect(getListeningDuration(7, total)).toBe(10)
      expect(getListeningDuration(8, total)).toBe(10)
      expect(getListeningDuration(9, total)).toBe(10)
    })
  })

  describe("edge cases", () => {
    it("returns 30s when totalRounds is 0", () => {
      expect(getListeningDuration(0, 0)).toBe(30)
    })

    it("returns 30s when totalRounds is negative", () => {
      expect(getListeningDuration(0, -1)).toBe(30)
    })

    it("handles 15 rounds (divisible by 3)", () => {
      const total = 15
      // First 5: 30s
      expect(getListeningDuration(4, total)).toBe(30)
      // Second 5: 20s
      expect(getListeningDuration(5, total)).toBe(20)
      expect(getListeningDuration(9, total)).toBe(20)
      // Last 5: 10s
      expect(getListeningDuration(10, total)).toBe(10)
      expect(getListeningDuration(14, total)).toBe(10)
    })

    it("handles 20 rounds", () => {
      const total = 20
      // thirdSize = 6.667, so indices 0-6 < 6.667 -> 30s, 7-13 < 13.333 -> 20s, 14-19 -> 10s
      expect(getListeningDuration(0, total)).toBe(30)
      expect(getListeningDuration(6, total)).toBe(30)
      expect(getListeningDuration(7, total)).toBe(20)
      expect(getListeningDuration(13, total)).toBe(20)
      expect(getListeningDuration(14, total)).toBe(10)
      expect(getListeningDuration(19, total)).toBe(10)
    })
  })
})
