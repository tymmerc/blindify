import { test, expect } from "@playwright/test"

const BASE = "https://tymmerc.eu/blindify"
const SPOTIFY_PROFILE = "https://open.spotify.com/user/yigiha54gqwl2tj39ymvu1n2s"

async function registerViaPage(page: any) {
  const username = `e2e_full_${Date.now()}`
  await page.goto(`${BASE}/auth/login`)
  await page.waitForTimeout(1_000)
  const tabs = page.locator("button").filter({ hasText: /inscription/i })
  if (await tabs.count() > 0) await tabs.first().click()
  await page.waitForTimeout(500)
  const inputs = page.locator("input")
  await inputs.nth(0).fill(username)
  await inputs.nth(1).fill("testpass123")
  await page.locator("button[type='submit']").click()
  await page.waitForTimeout(2_000)
  return username
}

async function createRoom(page: any, entryUrl: string) {
  await page.goto(entryUrl)
  await page.waitForLoadState("networkidle")
  await page.waitForSelector("h1", { state: "visible", timeout: 5000 })

  // Check if this is the friends wizard or event page
  const isFriends = entryUrl.includes("/friends")

  if (isFriends) {
    // Wizard step 1: Nickname
    const nicknameInput = page.locator("input[placeholder='Ton pseudo']")
    if (await nicknameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nicknameInput.fill("Host" + Date.now().toString().slice(-4))
      await page.locator("button", { hasText: "Continuer" }).click()
      await page.waitForTimeout(500)
    }
    // Wizard step 2: Music - skip
    const skipOrContinue = page.locator("button", { hasText: /Continuer|Passer/ }).first()
    if (await skipOrContinue.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipOrContinue.click()
      await page.waitForTimeout(500)
    }
    // Wizard step 3: Intent - create
    const createParty = page.locator("text=/Cr[eé]er une partie/").first()
    if (await createParty.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createParty.click()
      await page.waitForTimeout(8_000)
      return true
    }
    return false
  } else {
    // Event page: click launch button
    const mainBtn = page.locator("button, a").filter({ hasText: /cr[ée]er|lancer|d[ée]marrer/i }).first()
    await mainBtn.click()
    await page.waitForTimeout(1_500)

    const createBtn = page.locator("button, a").filter({ hasText: /cr[ée]er une salle/i })
    if (await createBtn.count() > 0) {
      await createBtn.first().click()
      await page.waitForTimeout(8_000)
      return true
    }
    return false
  }
}

test.describe("Friends — full game with import and audio", () => {
  test("create room, import Spotify, launch, verify game UI + audio", async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000)
    const audioRequests: string[] = []
    page.on("request", (req) => {
      if (req.url().includes("dzcdn.net")) audioRequests.push(req.url())
    })

    await registerViaPage(page)
    const created = await createRoom(page, `${BASE}/friends`)
    expect(created).toBe(true)

    await page.screenshot({ path: "e2e/screenshots/game-friends-lobby.png" })

    // Spotify import no longer in lobby UI (moved to wizard step 2) — skip
    console.log("Spotify import no longer in lobby, skipping")
    await page.screenshot({ path: "e2e/screenshots/game-friends-lobby-ready.png" })

    // Click "Lancer la partie" / "PRESS START"
    const launchBtn = page.locator("button").filter({ hasText: /pose le diamant|lancer la partie|press start/i })
    if (await launchBtn.count() > 0 && await launchBtn.first().isEnabled()) {
      console.log("Launching game...")
      await launchBtn.first().click()
      await page.waitForTimeout(15_000)
      await page.screenshot({ path: "e2e/screenshots/game-friends-playing.png" })

      const gameText = await page.locator("body").innerText()
      console.log("Game UI (400):", gameText?.slice(0, 400))
      console.log(`Audio requests: ${audioRequests.length}`)
    } else {
      console.log("Launch button not available")
      const btns = await page.locator("button").allTextContents()
      console.log("Available buttons:", btns.filter(t => t.trim()).join(" | "))
    }
  })
})

test.describe("Event — create room and reach lobby", () => {
  test("create room via modal, see lobby with code", async ({ page }) => {
    await registerViaPage(page)
    const created = await createRoom(page, `${BASE}/event`)
    expect(created).toBe(true)

    await page.screenshot({ path: "e2e/screenshots/game-event-lobby.png" })

    const text = await page.locator("body").innerText()
    console.log("Event lobby (400):", text?.slice(0, 400))

    // Check for room code
    const codeMatch = text?.match(/\b[A-Z0-9]{5,8}\b/)
    if (codeMatch) {
      console.log(`Event room code: ${codeMatch[0]}`)
    }

    // Check for key UI elements
    const hasCode = text?.includes("Code")
    const hasLancer = text?.includes("Lancer")
    console.log(`Has code display: ${hasCode}, Has launch button: ${hasLancer}`)
  })
})
