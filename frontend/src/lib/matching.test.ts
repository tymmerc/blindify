import { describe, it, expect } from "vitest"
import { evaluateGuess, evaluateGuessSeparate, normalize, tokenize } from "./matching"

describe("matching", () => {
  describe("normalize", () => {
    it("should lowercase and remove accents", () => {
      expect(normalize("Café")).toBe("cafe")
    })
    it("should replace special characters", () => {
      expect(normalize("Rock & Roll")).toBe("rock and roll")
    })
  })

  describe("tokenize", () => {
    it("should remove stop words like feat", () => {
      expect(tokenize("Song feat. Artist")).toEqual(["song", "artist"])
    })
  })

  describe("evaluateGuess (combined)", () => {
    const track = { title: "Supermassive Black Hole", artist: "Muse" }

    it("should match title only → close", () => {
      const result = evaluateGuess("supermassive black hole", track)
      expect(result.matchedTitle).toBe(true)
      expect(result.matchedArtist).toBe(false)
      expect(result.verdict).toBe("close")
    })

    it("should match title + artist → correct", () => {
      const result = evaluateGuess("supermassive black hole muse", track)
      expect(result.matchedTitle).toBe(true)
      expect(result.matchedArtist).toBe(true)
      expect(result.verdict).toBe("correct")
    })

    it("should not match wrong guess → wrong", () => {
      const result = evaluateGuess("bohemian rhapsody", track)
      expect(result.verdict).toBe("wrong")
    })
  })

  describe("evaluateGuessSeparate", () => {
    const track = { title: "Supermassive Black Hole", artist: "Muse" }

    it("should match title only when artist is empty → close", () => {
      const result = evaluateGuessSeparate("supermassive black hole", "", track)
      expect(result.matchedTitle).toBe(true)
      expect(result.matchedArtist).toBe(false)
      expect(result.verdict).toBe("close")
      expect(result.guessProvided).toBe(true)
    })

    it("should match both when both provided → correct", () => {
      const result = evaluateGuessSeparate("supermassive black hole", "muse", track)
      expect(result.matchedTitle).toBe(true)
      expect(result.matchedArtist).toBe(true)
      expect(result.verdict).toBe("correct")
    })

    it("should match artist only → close", () => {
      const result = evaluateGuessSeparate("", "muse", track)
      expect(result.matchedTitle).toBe(false)
      expect(result.matchedArtist).toBe(true)
      expect(result.verdict).toBe("close")
    })

    it("should handle empty inputs → wrong", () => {
      const result = evaluateGuessSeparate("", "", track)
      expect(result.verdict).toBe("wrong")
      expect(result.guessProvided).toBe(false)
    })

    it("should handle fuzzy matching on title", () => {
      const result = evaluateGuessSeparate("supermassiv black hole", "", track)
      expect(result.matchedTitle).toBe(true)
      expect(result.verdict).toBe("close")
    })
  })
})
