import { test, expect } from "@playwright/test"

const BASE = "https://tymmerc.eu/blindify"

test.describe("Friends mode", () => {
  test("friends entry page loads with create/join options", async ({ page }) => {
    await page.goto(`${BASE}/friends`)
    await page.waitForTimeout(2_000)
    await page.screenshot({ path: "e2e/screenshots/friends-entry.png" })
    const text = await page.textContent("body")
    console.log("Friends page text (200):", text?.slice(0, 200))
  })

  test("friends lobby loads when creating a room", async ({ page }) => {
    // First need to be logged in — try guest/auto login
    await page.goto(`${BASE}/multiplayer?mode=friends&intent=host`)
    await page.waitForTimeout(5_000)
    await page.screenshot({ path: "e2e/screenshots/friends-lobby.png" })
    const text = await page.textContent("body")
    console.log("Friends lobby text (300):", text?.slice(0, 300))
  })
})

test.describe("Event mode (presentation)", () => {
  test("event entry page loads with host/join options", async ({ page }) => {
    await page.goto(`${BASE}/event`)
    await page.waitForTimeout(2_000)
    await page.screenshot({ path: "e2e/screenshots/event-entry.png" })
    const text = await page.textContent("body")
    console.log("Event page text (200):", text?.slice(0, 200))
  })

  test("event lobby loads when creating a room", async ({ page }) => {
    await page.goto(`${BASE}/multiplayer?mode=event&intent=host`)
    await page.waitForTimeout(5_000)
    await page.screenshot({ path: "e2e/screenshots/event-lobby.png" })
    const text = await page.textContent("body")
    console.log("Event lobby text (300):", text?.slice(0, 300))
  })
})

test.describe("Streamer mode", () => {
  test("streamer entry page loads (WIP)", async ({ page }) => {
    await page.goto(`${BASE}/streamer`)
    await page.waitForTimeout(2_000)
    await page.screenshot({ path: "e2e/screenshots/streamer-entry.png" })
    const text = await page.textContent("body")
    console.log("Streamer page text (200):", text?.slice(0, 200))
  })
})

test.describe("Modes page", () => {
  test("all modes are accessible from modes page", async ({ page }) => {
    await page.goto(`${BASE}/modes`)
    await page.waitForTimeout(2_000)
    await page.screenshot({ path: "e2e/screenshots/modes-full.png" })

    // Check for mode links
    const links = await page.locator("a").allTextContents()
    const buttons = await page.locator("button").allTextContents()
    const all = [...links, ...buttons].join(" | ")
    console.log("Modes page links/buttons:", all)
  })
})

test.describe("Backend multiplayer endpoints", () => {
  test("rooms API is accessible", async ({ request }) => {
    // Try creating a room (will likely fail without auth, but should not 500)
    const res = await request.post(`${BASE}/api/rooms/create`, {
      headers: { "Content-Type": "application/json", "Origin": "https://tymmerc.eu" },
      data: { mode: "friends" },
    })
    const status = res.status()
    const body = await res.json().catch(() => null)
    console.log(`Create room: status=${status}, body=${JSON.stringify(body)?.slice(0, 200)}`)
    // Should be 401 (no auth) or 200, not 500
    expect(status).not.toBe(500)
  })

  test("socket.io endpoint responds", async ({ request }) => {
    const res = await request.get(`${BASE}/socket.io/?EIO=4&transport=polling`)
    console.log(`Socket.io polling: status=${res.status()}`)
    // Socket.io polling should return 200 with handshake
    expect(res.status()).toBeLessThan(500)
  })
})
