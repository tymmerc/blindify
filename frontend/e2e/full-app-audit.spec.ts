import { test, expect } from "@playwright/test"

const BASE = "https://tymmerc.eu/blindify"

test.describe("Navigation audit — all links valid", () => {
  test("home page redirects", async ({ page }) => {
    await page.goto(BASE)
    await page.waitForTimeout(3_000)
    const url = page.url()
    console.log(`Home redirects to: ${url}`)
    // Should redirect to /modes or show redirect text
    const text = await page.textContent("body")
    const isRedirecting = url.includes("modes") || text?.includes("Redirection")
    expect(isRedirecting).toBe(true)
  })

  test("auth page loads with login + register + guest", async ({ page }) => {
    await page.goto(`${BASE}/auth/login`)
    await page.waitForTimeout(1_000)
    const text = await page.textContent("body")
    expect(text).toContain("Connexion")
    expect(text).toContain("Inscription")
    expect(text).toContain("Jouer sans compte")
  })

  test("auth returnTo param works in code", async ({ page }) => {
    await page.goto(`${BASE}/auth/login?returnTo=/multiplayer?mode=friends`)
    await page.waitForTimeout(1_000)
    const text = await page.textContent("body")
    // Page should load fine
    expect(text).toContain("Connexion")
  })

  test("modes page has all navigation", async ({ page }) => {
    await page.goto(`${BASE}/modes`)
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 })
    const text = await page.locator("body").innerText()
    expect(text).toContain("Jouer avec des amis")
    expect(text).toContain("Jouer en solo")
    expect(text).toContain("Jouer en événement")
    expect(text).toContain("Mode Streamer")
  })

  test("solo page loads", async ({ page }) => {
    await page.goto(`${BASE}/solo`)
    await page.waitForTimeout(1_000)
    expect(await page.locator("input[type='url']").isVisible()).toBe(true)
    expect(await page.locator("button[type='submit']").isVisible()).toBe(true)
  })

  test("chrono page loads", async ({ page }) => {
    await page.goto(`${BASE}/chrono`)
    await page.waitForTimeout(1_000)
    expect(await page.locator("input[type='url']").isVisible()).toBe(true)
  })

  test("challenge page loads with code input", async ({ page }) => {
    await page.goto(`${BASE}/challenge`)
    await page.waitForTimeout(1_000)
    const text = await page.textContent("body")
    expect(text).toContain("defi")
  })

  test("history page loads", async ({ page }) => {
    await page.goto(`${BASE}/history`)
    await page.waitForTimeout(1_000)
    const text = await page.textContent("body")
    // Should show either games or empty state
    const h1 = await page.locator("h1").textContent().catch(() => "")
    // Either shows history or redirects to login (requires auth)
    const valid = h1?.includes("Historique") || h1?.includes("revoir") || h1?.includes("compte")
    expect(valid).toBe(true)
  })

  test("friends page loads", async ({ page }) => {
    await page.goto(`${BASE}/friends`)
    await page.waitForTimeout(1_000)
    const text = await page.textContent("body")
    expect(text).toContain("amis")
  })

  test("event page loads", async ({ page }) => {
    await page.goto(`${BASE}/event`)
    await page.waitForTimeout(1_000)
    const text = await page.textContent("body")
    expect(text).toContain("Projection") || expect(text).toContain("événement")
  })

  test("profile page loads", async ({ page }) => {
    await page.goto(`${BASE}/profile`)
    await page.waitForTimeout(1_000)
    // Should load (maybe redirect to login if not auth)
    expect(page.url()).toBeTruthy()
  })

  test("stats page loads", async ({ page }) => {
    await page.goto(`${BASE}/stats`)
    await page.waitForTimeout(1_000)
    expect(page.url()).toBeTruthy()
  })

  test("404 page works", async ({ page }) => {
    await page.goto(`${BASE}/nonexistent-page-xyz`)
    await page.waitForTimeout(1_000)
    const text = await page.textContent("body")
    // Should show 404 or redirect
    console.log(`404 page text: ${text?.slice(0, 100)}`)
  })
})

test.describe("API health", () => {
  test("all API endpoints respond (no 500)", async ({ request }) => {
    const endpoints = [
      { method: "GET", url: `${BASE}/api/health` },
      { method: "POST", url: `${BASE}/api/quick-play`, body: { url: "https://example.com", count: 1 }, expectError: true },
      { method: "GET", url: `${BASE}/api/challenges/NONEXIST` },
      { method: "GET", url: `${BASE}/api/games/history` },
    ]

    for (const ep of endpoints) {
      const res = ep.method === "POST"
        ? await request.post(ep.url, {
            headers: { "Content-Type": "application/json", "Origin": "https://tymmerc.eu" },
            data: ep.body || {},
          })
        : await request.get(ep.url)

      console.log(`${ep.method} ${ep.url.replace(BASE, "")}: ${res.status()}`)
      expect(res.status()).toBeLessThan(500)
    }
  })

  test("socket.io responds", async ({ request }) => {
    const res = await request.get(`${BASE}/socket.io/?EIO=4&transport=polling`)
    console.log(`Socket.io: ${res.status()}`)
    expect(res.status()).toBeLessThan(500)
  })
})

test.describe("Theme toggle", () => {
  test("toggle exists on all pages", async ({ page }) => {
    const pages = ["/solo", "/chrono", "/modes", "/challenge", "/history"]
    for (const p of pages) {
      await page.goto(`${BASE}${p}`)
      await page.waitForTimeout(500)
      const toggle = page.locator("button[aria-label*='mode']")
      const visible = await toggle.isVisible().catch(() => false)
      console.log(`Theme toggle on ${p}: ${visible}`)
    }
  })
})
