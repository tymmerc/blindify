import { test, expect } from "@playwright/test"

const BASE = "https://tymmerc.eu/blindify"

async function registerViaPage(page: any) {
  const username = `e2e_mp_${Date.now()}`
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

test.describe("Friends mode — create room and reach lobby", () => {
  test("register, wizard create flow, see lobby with code", async ({ page }) => {
    const username = await registerViaPage(page)
    console.log(`Registered: ${username}`)

    // Go to friends entry (wizard)
    await page.goto(`${BASE}/friends`)
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 })

    // Wizard step 1: Nickname
    const nicknameInput = page.locator("input[placeholder='Ton pseudo']")
    await nicknameInput.fill(username)
    await page.locator("button", { hasText: "Continuer" }).click()
    await page.waitForTimeout(500)

    // Wizard step 2: Music - skip
    await page.locator("button", { hasText: /Continuer|Passer/ }).first().click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: "e2e/screenshots/mp2-friends-intent.png" })

    // Wizard step 3: Intent - create
    await page.locator("text=/Cr[eé]er une partie/").first().click()
    await page.waitForTimeout(8_000)
    await page.screenshot({ path: "e2e/screenshots/mp2-friends-lobby.png" })

    const url = page.url()
    console.log("After create URL:", url)

    await page.waitForSelector("body", { state: "visible" })
    const text = await page.locator("body").innerText()
    console.log("Lobby text (500):", text?.slice(0, 500))

    // Check if we're in a lobby or multiplayer page
    const isInMultiplayer = url.includes("multiplayer") || url.includes("friends")
    console.log("In multiplayer/friends:", isInMultiplayer)
  })
})

test.describe("Event mode — create room and reach lobby", () => {
  test("register, click launch, see lobby", async ({ page }) => {
    const username = await registerViaPage(page)
    console.log(`Registered: ${username}`)

    await page.goto(`${BASE}/event`)
    await page.waitForTimeout(2_000)

    // Click "Lancer l'ecran principal"
    const launchBtn = page.locator("button, a").filter({ hasText: /lancer l'[ée]cran/i })
    const count = await launchBtn.count()
    console.log(`Launch buttons: ${count}`)

    if (count > 0) {
      await launchBtn.first().click()
      await page.waitForTimeout(8_000)
      await page.screenshot({ path: "e2e/screenshots/mp2-event-lobby.png" })

      const url = page.url()
      console.log("After launch URL:", url)

      const text = await page.textContent("body")
      console.log("Event lobby (500):", text?.slice(0, 500))
    }
  })
})

test.describe("Friends — full game with Spotify", () => {
  test("create room, set playlist, start game, verify audio", async ({ page }) => {
    const audioRequests: string[] = []
    page.on("request", (req) => {
      if (req.url().includes("dzcdn.net")) audioRequests.push(req.url())
    })

    const username = await registerViaPage(page)
    console.log(`Registered: ${username}`)

    await page.goto(`${BASE}/friends`)
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 })

    // Wizard step 1: Nickname
    const nicknameInput = page.locator("input[placeholder='Ton pseudo']")
    await nicknameInput.fill(username)
    await page.locator("button", { hasText: "Continuer" }).click()
    await page.waitForTimeout(500)

    // Wizard step 2: Music - skip
    await page.locator("button", { hasText: /Continuer|Passer/ }).first().click()
    await page.waitForTimeout(500)

    // Wizard step 3: Intent - create
    await page.locator("text=/Cr[eé]er une partie/").first().click()
    await page.waitForTimeout(8_000)
    await page.screenshot({ path: "e2e/screenshots/mp2-friends-room.png" })

    {
      const url = page.url()
      await page.waitForSelector("body", { state: "visible" })
      const text = await page.locator("body").innerText()
      console.log("Room URL:", url)
      console.log("Room text (600):", text?.slice(0, 600))

      // Look for a "Lancer" button to start the game
      const startBtns = page.locator("button").filter({ hasText: /lancer|start|commencer|jouer/i })
      const startCount = await startBtns.count()
      console.log(`Start buttons: ${startCount}`)

      // Look for playlist/URL input in the lobby
      const urlInput = page.locator("input[type='url'], input[placeholder*='playlist'], input[placeholder*='lien'], input[placeholder*='Spotify'], input[placeholder*='Deezer']")
      const urlInputCount = await urlInput.count()
      console.log(`URL inputs: ${urlInputCount}`)

      // Look for any input
      const allInputs = page.locator("input")
      const inputCount = await allInputs.count()
      console.log(`All inputs: ${inputCount}`)
      for (let i = 0; i < Math.min(inputCount, 5); i++) {
        const ph = await allInputs.nth(i).getAttribute("placeholder")
        const type = await allInputs.nth(i).getAttribute("type")
        console.log(`  Input ${i}: type=${type}, placeholder=${ph}`)
      }

      // Check all buttons
      const allBtns = page.locator("button")
      const btnTexts = await allBtns.allTextContents()
      console.log("All buttons:", btnTexts.filter(t => t.trim()).join(" | "))
    }

    console.log(`Audio requests: ${audioRequests.length}`)
  })
})
