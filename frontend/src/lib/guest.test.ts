import { beforeEach, describe, expect, it, vi } from "vitest"

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}

describe("getOrCreateGuest", () => {
  beforeEach(() => {
    vi.resetModules()
    localStorageMock.getItem.mockReset()
    localStorageMock.setItem.mockReset()
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      writable: true,
    })
  })

  async function loadGuest() {
    const mod = await import("@/lib/guest")
    return mod.getOrCreateGuest
  }

  it("should generate a guest profile with id and name", async () => {
    localStorageMock.getItem.mockReturnValue(null)
    const getOrCreateGuest = await loadGuest()
    const guest = getOrCreateGuest()
    expect(guest).toHaveProperty("id")
    expect(guest).toHaveProperty("name")
    expect(typeof guest.id).toBe("string")
    expect(typeof guest.name).toBe("string")
    expect(guest.id.length).toBeGreaterThan(0)
    expect(guest.name.length).toBeGreaterThan(0)
  })

  it("should return existing guest from localStorage if valid", async () => {
    const stored = { id: "abc-123", name: "Invité TEST" }
    localStorageMock.getItem.mockReturnValue(JSON.stringify(stored))
    const getOrCreateGuest = await loadGuest()
    const guest = getOrCreateGuest()
    expect(guest).toEqual(stored)
  })

  it("should generate new guest if localStorage is empty", async () => {
    localStorageMock.getItem.mockReturnValue(null)
    const getOrCreateGuest = await loadGuest()
    const guest = getOrCreateGuest()
    expect(guest.id).toBeTruthy()
    expect(guest.name).toMatch(/^Invité [A-Z0-9]{4}$/)
  })

  it("should generate new guest if localStorage contains invalid JSON", async () => {
    localStorageMock.getItem.mockReturnValue("{not valid json")
    const getOrCreateGuest = await loadGuest()
    const guest = getOrCreateGuest()
    expect(guest.id).toBeTruthy()
    expect(guest.name).toMatch(/^Invité [A-Z0-9]{4}$/)
  })

  it("should generate new guest if localStorage profile is incomplete", async () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify({ id: "only-id" }))
    const getOrCreateGuest = await loadGuest()
    const guest = getOrCreateGuest()
    expect(guest.id).toBeTruthy()
    expect(guest.name).toMatch(/^Invité [A-Z0-9]{4}$/)
    // The returned guest should NOT be the incomplete one
    expect(guest.id).not.toBe("only-id")
  })

  it("should save generated guest to localStorage", async () => {
    localStorageMock.getItem.mockReturnValue(null)
    const getOrCreateGuest = await loadGuest()
    const guest = getOrCreateGuest()
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "blindify:guest",
      JSON.stringify(guest)
    )
  })

  it("should handle localStorage.getItem throwing", async () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error("SecurityError")
    })
    const getOrCreateGuest = await loadGuest()
    const guest = getOrCreateGuest()
    expect(guest.id).toBeTruthy()
    expect(guest.name).toBeTruthy()
  })

  it("should handle localStorage.setItem throwing", async () => {
    localStorageMock.getItem.mockReturnValue(null)
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error("QuotaExceeded")
    })
    const getOrCreateGuest = await loadGuest()
    const guest = getOrCreateGuest()
    // Should still return a valid guest even if saving fails
    expect(guest.id).toBeTruthy()
    expect(guest.name).toBeTruthy()
  })

  it("should work on server (typeof window === 'undefined')", async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error -- simulating server environment
    delete globalThis.window
    try {
      vi.resetModules()
      const mod = await import("@/lib/guest")
      const guest = mod.getOrCreateGuest()
      expect(guest.id).toBeTruthy()
      expect(guest.name).toBeTruthy()
    } finally {
      globalThis.window = originalWindow
    }
  })
})
