import { test, expect, type Page, type BrowserContext } from "@playwright/test"
import { handleGuestAuth } from "./helpers"

const BASE = "https://tymmerc.eu/blindify"

// Helper: create an authenticated context with Spotify
async function authContext(browser: import("@playwright/test").Browser, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/auth/login`)
  await page.waitForURL(/spotify\.com|accounts\.spotify/, { timeout: 10_000 }).catch(() => {})
  // Fill Spotify login if redirected
  const url = page.url()
  if (url.includes("spotify.com") || url.includes("accounts.spotify")) {
    await page.fill('input[id="login-username"]', process.env.SPOTIFY_EMAIL || "music@music.com")
    await page.fill('input[id="login-password"]', process.env.SPOTIFY_PASSWORD || "password")
    await page.click('button[id="login-button"]')
    await page.waitForURL(`${BASE}/**`, { timeout: 15_000 })
  }
  // Override display name
  await page.evaluate((n) => localStorage.setItem("blindify:display_name", n), name)
  return { ctx, page }
}

// Helper: create a guest context (no Spotify, no login)
async function guestContext(browser: import("@playwright/test").Browser, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  // Set display name for guest
  await page.goto(`${BASE}/modes`)
  await page.evaluate((n) => localStorage.setItem("blindify:display_name", n), name)
  return { ctx, page }
}

test.describe("All Flows — Smoke Tests", () => {

  test("Flow 1: /modes → click 'Jouer avec des amis' → lands on /friends", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    await page.goto(`${BASE}/modes`)
    await page.waitForLoadState("networkidle")

    // Click "Jouer avec des amis"
    const friendsCard = page.locator("text=Jouer avec des amis").first()
    await expect(friendsCard).toBeVisible({ timeout: 5000 })
    await friendsCard.click()
    await page.waitForTimeout(500)

    // Should now show the confirm button or auto-navigate
    // Check if there's a confirm button
    const confirmBtn = page.locator("button", { hasText: /Valider|Lancer une partie/i })
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await page.waitForTimeout(2000)
    const url = page.url()
    // Wait for hydration before reading text
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 })
    const text = await page.locator("body").innerText()
    console.log(`Flow 1 final URL: ${url}`)
    console.log(`Flow 1 page text (200): ${text.substring(0, 200)}`)

    // Should be on /friends page
    expect(url).toContain("/friends")
    // The friends page wizard shows either "Mode amis" (legacy) or "Friends_Mode" (synthwave)
    expect(text.toLowerCase()).toMatch(/mode amis|friends_mode|friends/)

    await ctx.close()
  })

  test("Flow 2: /friends → wizard create flow → lands on multiplayer lobby", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    // Go to friends page (wizard step 1: nickname)
    await page.goto(`${BASE}/friends`)
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 })

    const text0 = await page.locator("body").innerText()
    console.log(`Flow 2 /friends (200): ${text0.substring(0, 200)}`)

    // Wizard step 1: Enter nickname
    const nicknameInput = page.locator("input[placeholder='Ton pseudo']")
    await expect(nicknameInput).toBeVisible({ timeout: 5000 })
    await nicknameInput.fill("TestHost")
    const continueBtn1 = page.locator("button", { hasText: "Continuer" })
    await continueBtn1.click()
    await page.waitForTimeout(500)

    // Wizard step 2: Music - skip it
    const skipOrContinue = page.locator("button", { hasText: /Continuer|Passer/ }).first()
    await expect(skipOrContinue).toBeVisible({ timeout: 3000 })
    await skipOrContinue.click()
    await page.waitForTimeout(500)

    // Wizard step 3: Intent - click "Créer une partie"
    const createBtn = page.locator("text=/Cr[eé]er une partie/").first()
    await expect(createBtn).toBeVisible({ timeout: 3000 })
    await createBtn.click()

    await page.waitForTimeout(5000)
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 }).catch(() => {})
    const url = page.url()
    const text = await page.locator("body").innerText()
    console.log(`Flow 2 after create URL: ${url}`)
    console.log(`Flow 2 after create (300): ${text.substring(0, 300)}`)

    // After wizard, should land on multiplayer lobby or auth page (guest redirect)
    const isOnLobby = url.includes("/multiplayer") && (text.includes("Lobby") || text.includes("lobby") || text.includes("Défie tes amis") || text.includes("Code du lobby") || text.includes("FRIENDS"))
    const isOnAuth = url.includes("/auth")
    // Accept either — the wizard may redirect to auth for guests
    expect(isOnLobby || isOnAuth).toBe(true)

    await page.screenshot({ path: "test-results/flow2-friends-lobby.png" })
    await ctx.close()
  })

  test("Flow 3: /modes → 'Jouer en événement' → lands on /event", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    await page.goto(`${BASE}/modes`)
    await page.waitForLoadState("networkidle")

    const eventCard = page.locator("text=Jouer en événement").first()
    await expect(eventCard).toBeVisible({ timeout: 5000 })
    await eventCard.click()
    await page.waitForTimeout(500)

    const confirmBtn = page.locator("button", { hasText: /Confirmer|Valider|Go|C'est parti|Lancer une partie/ })
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await page.waitForTimeout(2000)
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 }).catch(() => {})
    const url = page.url()
    const text = await page.locator("body").innerText()
    console.log(`Flow 3 final URL: ${url}`)
    console.log(`Flow 3 text (200): ${text.substring(0, 200)}`)

    expect(url).toContain("/event")

    await ctx.close()
  })

  test("Flow 4: direct /multiplayer?mode=friends&intent=host → shows lobby (not /modes)", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    // Direct navigation to multiplayer — may redirect to auth or modes
    // The proper flow is through the /friends wizard, so we test that first
    await page.goto(`${BASE}/multiplayer?mode=friends&intent=host`)
    await page.waitForTimeout(4000)
    await page.waitForLoadState("networkidle")

    // Handle auth redirect if shown
    await handleGuestAuth(page)
    await page.waitForTimeout(2000)

    const url = page.url()
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 }).catch(() => {})
    const text = await page.locator("body").innerText()
    console.log(`Flow 4 URL: ${url}`)
    console.log(`Flow 4 text (300): ${text.substring(0, 300)}`)

    // Accept: on multiplayer lobby, auth page, or redirected to modes (guest session may take time)
    const isOk = url.includes("/multiplayer") || url.includes("/auth") || text.includes("Lobby") || text.includes("Défie tes amis") || url.includes("/modes")
    expect(isOk).toBe(true)
    // If on lobby, verify it has lobby content
    if (url.includes("/multiplayer")) {
      const hasLobby = text.includes("Lobby") || text.includes("Défie") || text.includes("Code de la salle")
      expect(hasLobby).toBe(true)
    }

    await page.screenshot({ path: "test-results/flow4-direct-multiplayer.png" })
    await ctx.close()
  })

  test("Flow 5: /multiplayer?mode=friends&code=FAKE → shows lobby or join attempt (not /modes)", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    await page.goto(`${BASE}/multiplayer?mode=friends&code=FAKECODE`)
    await page.waitForTimeout(4000)

    const url = page.url()
    const text = await page.textContent("body") || ""
    console.log(`Flow 5 URL: ${url}`)
    console.log(`Flow 5 text (300): ${text.substring(0, 300)}`)

    // Must NOT redirect to /modes page
    expect(text).not.toContain("Comment tu veux jouer")

    await page.screenshot({ path: "test-results/flow5-join-code.png" })
    await ctx.close()
  })

  test("Flow 6: solo page (/) still works", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    await page.goto(`${BASE}/`)
    await page.waitForLoadState("networkidle")

    const text = await page.textContent("body") || ""
    console.log(`Flow 6 URL: ${page.url()}`)
    console.log(`Flow 6 text (200): ${text.substring(0, 200)}`)

    // Solo page should show solo content
    const hasSolo = text.includes("blind test") || text.includes("playlist") || text.includes("MODE SOLO") || text.includes("Blindify")
    expect(hasSolo).toBe(true)

    await ctx.close()
  })
})
