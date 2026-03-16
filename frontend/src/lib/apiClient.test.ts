import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, clientApi } from "@/lib/apiClient"

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function okResponse<T>(data: T) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(JSON.stringify({ success: true, data, error: null })),
    json: () => Promise.resolve({ success: true, data, error: null }),
  }
}

function errorResponse(status: number, code: string, message: string) {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve({ success: false, data: null, error: { code, message } }),
  }
}

function noContentResponse() {
  return {
    ok: true,
    status: 204,
    statusText: "No Content",
    text: () => Promise.resolve(""),
    json: () => Promise.reject(new Error("No content")),
  }
}

describe("clientApi", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe("register", () => {
    it("should POST to /api/auth/register with username and password", async () => {
      const responseData = { user: { id: 1, username: "alice" }, sessionToken: "tok123" }
      mockFetch.mockResolvedValueOnce(okResponse(responseData))

      await clientApi.register("alice", "pass123")

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain("/api/auth/register")
      expect(init.method).toBe("POST")
      expect(JSON.parse(init.body)).toEqual({ username: "alice", password: "pass123" })
    })

    it("should return user and sessionToken on success", async () => {
      const responseData = { user: { id: 1, username: "alice" }, sessionToken: "tok123" }
      mockFetch.mockResolvedValueOnce(okResponse(responseData))

      const result = await clientApi.register("alice", "pass123")

      expect(result.user).toEqual({ id: 1, username: "alice" })
      expect(result.sessionToken).toBe("tok123")
    })

    it("should throw ApiError on failure response", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(400, "INVALID_INPUT", "Username taken"))

      await expect(clientApi.register("alice", "pass123")).rejects.toThrow(ApiError)
      await mockFetch.mockResolvedValueOnce(errorResponse(400, "INVALID_INPUT", "Username taken"))
      try {
        await clientApi.register("alice", "pass123")
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        expect((err as ApiError).status).toBe(400)
        expect((err as ApiError).message).toContain("Username taken")
      }
    })
  })

  describe("login", () => {
    it("should POST to /api/auth/login with credentials", async () => {
      const responseData = { user: { id: 1, username: "bob" }, sessionToken: "tok456" }
      mockFetch.mockResolvedValueOnce(okResponse(responseData))

      await clientApi.login("bob", "secret")

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain("/api/auth/login")
      expect(init.method).toBe("POST")
      expect(JSON.parse(init.body)).toEqual({ username: "bob", password: "secret" })
    })

    it("should return user and sessionToken on success", async () => {
      const responseData = { user: { id: 2, username: "bob" }, sessionToken: "tok456" }
      mockFetch.mockResolvedValueOnce(okResponse(responseData))

      const result = await clientApi.login("bob", "secret")

      expect(result.user).toEqual({ id: 2, username: "bob" })
      expect(result.sessionToken).toBe("tok456")
    })
  })

  describe("currentUser", () => {
    it("should GET /api/auth/me", async () => {
      const responseData = { user: { id: 1, username: "alice" }, providerConnection: null }
      mockFetch.mockResolvedValueOnce(okResponse(responseData))

      await clientApi.currentUser()

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain("/api/auth/me")
      expect(init.cache).toBe("no-store")
    })

    it("should return null on 401 error (not throw)", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, "UNAUTHORIZED", "Not logged in"))

      const result = await clientApi.currentUser()

      expect(result).toBeNull()
    })
  })

  describe("createGuestSession", () => {
    it("should POST to /api/auth/guest with nickname", async () => {
      const responseData = { sessionToken: "guest-tok" }
      mockFetch.mockResolvedValueOnce(okResponse(responseData))

      const result = await clientApi.createGuestSession("Player1")

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain("/api/auth/guest")
      expect(init.method).toBe("POST")
      expect(JSON.parse(init.body)).toEqual({ nickname: "Player1" })
      expect(result.sessionToken).toBe("guest-tok")
    })
  })

  describe("logout", () => {
    it("should POST to /api/auth/logout", async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse())

      await clientApi.logout()

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain("/api/auth/logout")
      expect(init.method).toBe("POST")
    })
  })

  describe("startSoloGame", () => {
    it("should POST to /api/games/solo with game params", async () => {
      const responseData = { session: { id: 1 }, tracks: [] }
      mockFetch.mockResolvedValueOnce(okResponse(responseData))

      await clientApi.startSoloGame({
        difficulty: "hard",
        source: "spotify",
        count: 5,
        provider: "spotify",
      })

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain("/api/games/solo")
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body)
      expect(body.difficulty).toBe("hard")
      expect(body.source).toBe("spotify")
      expect(body.count).toBe(5)
      expect(body.provider).toBe("spotify")
    })

    it("should pass source, count, provider correctly with defaults", async () => {
      const responseData = { session: { id: 1 }, tracks: [] }
      mockFetch.mockResolvedValueOnce(okResponse(responseData))

      await clientApi.startSoloGame()

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.difficulty).toBe("normal")
      expect(body.source).toBe("library")
      expect(body.count).toBe(10)
    })
  })

  describe("createRoom", () => {
    it("should POST to /api/rooms/create with correct params", async () => {
      const responseData = { room: { id: 1, code: "ABCD" } }
      mockFetch.mockResolvedValueOnce(okResponse(responseData))

      const result = await clientApi.createRoom({ name: "Test Room", maxPlayers: 4 })

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain("/api/rooms/create")
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body)
      expect(body.name).toBe("Test Room")
      expect(body.maxPlayers).toBe(4)
      expect(result.room).toEqual({ id: 1, code: "ABCD" })
    })
  })

  describe("joinRoom", () => {
    it("should POST to /api/rooms/:code/join", async () => {
      const responseData = { room: { id: 1, code: "WXYZ" } }
      mockFetch.mockResolvedValueOnce(okResponse(responseData))

      const result = await clientApi.joinRoom("WXYZ")

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain("/api/rooms/WXYZ/join")
      expect(init.method).toBe("POST")
      expect(result.room).toEqual({ id: 1, code: "WXYZ" })
    })
  })

  describe("quickPlay", () => {
    it("should POST to /api/quick-play with URL", async () => {
      const responseData = {
        session: { id: 1, mode: "solo", difficulty: "normal", provider: "spotify", totalRounds: 10, startedAt: "2026-01-01" },
        tracks: [],
        profileInfo: { provider: "spotify", playlistCount: 5, totalTracks: 100 },
      }
      mockFetch.mockResolvedValueOnce(okResponse(responseData))

      const result = await clientApi.quickPlay("https://open.spotify.com/user/test")

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain("/api/quick-play")
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body)
      expect(body.url).toBe("https://open.spotify.com/user/test")
      expect(result.session.id).toBe(1)
    })
  })

  describe("error handling", () => {
    it("should throw ApiError with code and message when success is false", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(JSON.stringify({
          success: false,
          data: null,
          error: { code: "GAME_ERROR", message: "No tracks available" },
        })),
      })

      try {
        await clientApi.startSoloGame()
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        expect((err as ApiError).message).toBe("No tracks available")
      }
    })

    it("should handle network errors (fetch rejects)", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"))

      await expect(clientApi.login("bob", "pass")).rejects.toThrow(TypeError)
    })
  })
})
