import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock HTMLAudioElement before importing audioManager
let mockPlay: ReturnType<typeof vi.fn>
let mockPause: ReturnType<typeof vi.fn>
let mockAddEventListener: ReturnType<typeof vi.fn>
let mockRemoveEventListener: ReturnType<typeof vi.fn>

class MockAudio {
  src = ""
  volume = 1
  loop = false
  currentTime = 0
  paused = true
  ended = false

  play = mockPlay
  pause = mockPause
  addEventListener = mockAddEventListener
  removeEventListener = mockRemoveEventListener
}

beforeEach(() => {
  mockPlay = vi.fn().mockResolvedValue(undefined)
  mockPause = vi.fn()
  mockAddEventListener = vi.fn()
  mockRemoveEventListener = vi.fn()

  // Reassign on prototype so new instances get fresh mocks
  MockAudio.prototype.play = mockPlay
  MockAudio.prototype.pause = mockPause
  MockAudio.prototype.addEventListener = mockAddEventListener
  MockAudio.prototype.removeEventListener = mockRemoveEventListener

  vi.stubGlobal("Audio", MockAudio)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

async function freshAudioManager() {
  const mod = await import("./audioManager")
  return mod.audioManager
}

describe("audioManager", () => {
  describe("play", () => {
    it("should create an Audio element and call play()", async () => {
      const am = await freshAudioManager()

      const result = await am.play({ src: "https://example.com/track.mp3", owner: "solo" })

      expect(result).not.toBeNull()
      expect(mockPlay).toHaveBeenCalledTimes(1)
    })

    it("should set src, loop, and volume on the audio element", async () => {
      const am = await freshAudioManager()

      const el = await am.play({ src: "https://example.com/track.mp3", loop: true, volume: 0.5, owner: "solo" })

      expect(el!.src).toBe("https://example.com/track.mp3")
      expect(el!.loop).toBe(true)
      expect(el!.volume).toBe(0.5)
    })

    it("should stop previous audio before playing new one", async () => {
      const am = await freshAudioManager()

      await am.play({ src: "https://example.com/track1.mp3", owner: "solo" })
      await am.play({ src: "https://example.com/track2.mp3", owner: "solo" })

      // pause called for stop of first track, then play of second
      expect(mockPause).toHaveBeenCalled()
    })

    it("should throw and stop on play() rejection (autoplay blocked)", async () => {
      const am = await freshAudioManager()

      const error = new DOMException("NotAllowedError", "NotAllowedError")
      mockPlay.mockRejectedValueOnce(error)

      await expect(
        am.play({ src: "https://example.com/track.mp3", owner: "solo" })
      ).rejects.toThrow()

      // After error, state should not be playing
      const state = am.getState()
      expect(state.playing).toBe(false)
      expect(state.owner).toBeNull()
    })
  })

  describe("stop", () => {
    it("should pause audio and reset state", async () => {
      const am = await freshAudioManager()

      await am.play({ src: "https://example.com/track.mp3", owner: "solo" })
      am.stop("test_stop", "solo")

      const state = am.getState()
      expect(state.owner).toBeNull()
      expect(state.playing).toBe(false)
      expect(state.lastStopReason).toBe("test_stop")
    })

    it("should nullify the audio element after stop", async () => {
      const am = await freshAudioManager()

      await am.play({ src: "https://example.com/track.mp3", owner: "solo" })
      am.stop("cleanup", "solo")

      expect(am.getCurrent("solo")).toBeNull()
    })

    it("should not stop if owner does not match", async () => {
      const am = await freshAudioManager()

      await am.play({ src: "https://example.com/track.mp3", owner: "solo" })
      am.stop("wrong_owner", "multiplayer")

      // Should still be owned by solo
      const state = am.getState()
      expect(state.owner).toBe("solo")
    })
  })

  describe("pause / resume", () => {
    it("should pause and resume playback", async () => {
      const am = await freshAudioManager()

      await am.play({ src: "https://example.com/track.mp3", owner: "solo" })
      am.pause("solo")
      expect(mockPause).toHaveBeenCalled()

      am.resume("solo")
      // play called again on resume
      expect(mockPlay).toHaveBeenCalledTimes(2)
    })
  })

  describe("volume / mute", () => {
    it("should set volume on the audio element", async () => {
      const am = await freshAudioManager()

      const el = await am.play({ src: "https://example.com/track.mp3", owner: "solo" })
      am.setVolume(0.8, "solo")

      expect(el!.volume).toBe(0.8)
      expect(am.getState().volume).toBe(0.8)
    })

    it("should mute by setting volume to 0", async () => {
      const am = await freshAudioManager()

      const el = await am.play({ src: "https://example.com/track.mp3", volume: 0.5, owner: "solo" })
      am.setMuted(true, "solo")

      expect(el!.volume).toBe(0)
      expect(am.getState().muted).toBe(true)
    })

    it("should clamp volume to [0, 1]", async () => {
      const am = await freshAudioManager()

      const el = await am.play({ src: "https://example.com/track.mp3", owner: "solo" })
      am.setVolume(5, "solo")
      expect(el!.volume).toBe(1)

      am.setVolume(-2, "solo")
      expect(el!.volume).toBe(0)
    })
  })

  describe("subscribe", () => {
    it("should notify listeners on state changes", async () => {
      const am = await freshAudioManager()
      const listener = vi.fn()

      am.subscribe(listener)
      // Called once immediately with initial state
      expect(listener).toHaveBeenCalledTimes(1)

      await am.play({ src: "https://example.com/track.mp3", owner: "solo" })
      // Called again on play
      expect(listener.mock.calls.length).toBeGreaterThan(1)
    })

    it("should return an unsubscribe function", async () => {
      const am = await freshAudioManager()
      const listener = vi.fn()

      const unsub = am.subscribe(listener)
      const callCount = listener.mock.calls.length

      unsub()
      am.stop("test")

      // No more calls after unsubscribe
      expect(listener.mock.calls.length).toBe(callCount)
    })
  })

  describe("getCurrent", () => {
    it("should return audio element for matching owner", async () => {
      const am = await freshAudioManager()

      await am.play({ src: "https://example.com/track.mp3", owner: "solo" })

      expect(am.getCurrent("solo")).not.toBeNull()
      expect(am.getCurrent("multiplayer")).toBeNull()
    })

    it("should return null after stop", async () => {
      const am = await freshAudioManager()

      await am.play({ src: "https://example.com/track.mp3", owner: "solo" })
      am.stop("done", "solo")

      expect(am.getCurrent("solo")).toBeNull()
    })
  })
})
