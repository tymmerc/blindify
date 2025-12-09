import { beforeEach, describe, expect, it, vi } from "vitest"

async function loadConfigWithEnv(env: Record<string, string | undefined>) {
  const prevEnv = { ...process.env }
  Object.assign(process.env, env)
  vi.resetModules()
  const mod = await import("./config")
  process.env = prevEnv
  return mod
}

describe("config apiUrl", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("normalizes trailing /api and slashes", async () => {
    const { API_BASE_URL, apiUrl } = await loadConfigWithEnv({
      NEXT_PUBLIC_API_URL: "https://example.com/api///",
    })
    expect(API_BASE_URL).toBe("https://example.com")
    expect(apiUrl("/api/rooms")).toBe("https://example.com/api/rooms")
    expect(apiUrl("api/rooms")).toBe("https://example.com/api/rooms")
  })

  it("prefers API_URL fallback", async () => {
    const { API_BASE_URL } = await loadConfigWithEnv({
      NEXT_PUBLIC_API_URL: undefined,
      API_URL: "http://localhost:8080/",
      NODE_ENV: "development",
    })
    expect(API_BASE_URL).toBe("http://localhost:8080")
  })

  it("defaults to localhost:3000 in dev when unset", async () => {
    const { API_BASE_URL } = await loadConfigWithEnv({
      NEXT_PUBLIC_API_URL: undefined,
      API_URL: undefined,
      NODE_ENV: "development",
    })
    expect(API_BASE_URL).toBe("http://localhost:3000")
  })
})
