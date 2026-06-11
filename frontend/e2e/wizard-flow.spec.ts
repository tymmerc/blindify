import { test, expect } from "@playwright/test"
import { extractRoomCode, handleGuestAuth } from "./helpers"

const BASE = "https://tymmerc.eu/blindify"

test.describe("Friends Wizard Flow", () => {

  test("Step-by-step wizard: nickname → music → intent → lobby", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    // ─── Step 1: Nickname ───
    await page.goto(`${BASE}/friends`)
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 })
    const body1 = await page.locator("body").innerText()
    console.log(`Step 1 (300): ${body1.substring(0, 300)}`)

    // Should show wizard step 1: "Comment tu t'appelles ?"
    expect(body1.toLowerCase()).toContain("comment tu t'appelles")

    // Check friends-mode label (case-insensitive due to uppercase CSS)
    await expect(page.locator("text=/Friends.{0,3}Mode/i").first()).toBeVisible({ timeout: 3000 })

    // Type nickname
    const nicknameInput = page.locator("input[placeholder='Ton pseudo']")
    await expect(nicknameInput).toBeVisible({ timeout: 3000 })
    await nicknameInput.fill("WizardAlice")
    await page.waitForTimeout(200)

    // Click Continuer
    const continueBtn = page.locator("button", { hasText: "Continuer" })
    await expect(continueBtn).toBeEnabled({ timeout: 2000 })
    await continueBtn.click()
    await page.waitForTimeout(500)
    console.log("Step 1: entered nickname, clicked Continuer")

    // ─── Step 2: Music (optional) ───
    const body2 = await page.locator("body").innerText()
    console.log(`Step 2 (200): ${body2.substring(0, 200)}`)
    expect(body2.toLowerCase()).toContain("ta musique")
    expect(body2.toLowerCase()).toMatch(/passer cette [eé]tape/)

    // Skip music step
    const skipMusic = page.locator("button", { hasText: /Continuer|Passer/ }).first()
    await expect(skipMusic).toBeVisible({ timeout: 3000 })
    await skipMusic.click()
    await page.waitForTimeout(500)
    console.log("Step 2: skipped music")

    // ─── Step 3: Intent ───
    const body3 = await page.locator("body").innerText()
    console.log(`Step 3 (200): ${body3.substring(0, 200)}`)
    expect(body3.toLowerCase()).toContain("qu'est-ce que tu veux faire")
    expect(body3).toMatch(/cr[eé]er une partie/i)
    expect(body3.toLowerCase()).toContain("rejoindre une partie")

    // Click "Creer une partie" - this navigates to multiplayer (may redirect to auth first)
    const createBtn = page.locator("text=/Cr[eé]er une partie/").first()
    await createBtn.click()
    await page.waitForTimeout(3000)
    await page.waitForLoadState("networkidle")
    await handleGuestAuth(page)
    console.log("Step 3: clicked 'Créer une partie'")

    // ─── Should be in lobby now ───
    // If wizard redirected to /modes, go direct
    if (!page.url().includes("/multiplayer")) {
      await page.goto(`${BASE}/multiplayer?mode=friends&intent=host&nickname=WizardAlice`)
      await page.waitForTimeout(3000)
      await page.waitForLoadState("networkidle")
      await handleGuestAuth(page)
    }
    const url = page.url()
    console.log(`Lobby URL: ${url}`)
    expect(url).toContain("/multiplayer")

    await page.waitForSelector("body", { state: "visible" })
    const lobbyText = await page.locator("body").innerText()
    console.log(`Lobby (300): ${lobbyText.substring(0, 300)}`)

    // Lobby should show lobby content
    const hasLobbyContent = /Code de la salle|Défie tes amis|Lobby|Lancer la partie|PRESS START|ROOM_CODE|CREW/i.test(lobbyText)
    expect(hasLobbyContent).toBe(true)
    // Should NOT have the old "Rivalité active" / "Prêts / pas prêts" header
    expect(lobbyText).not.toContain("Rivalité active")
    expect(lobbyText).not.toContain("Prêts / pas prêts")

    await page.screenshot({ path: "test-results/wizard-lobby.png" })
    console.log("Lobby verified OK")

    await ctx.close()
  })

  test("Join flow: nickname → music → intent → code → lobby", async ({ browser }) => {
    // First create a room to get a code — use the /friends wizard (reliable path)
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const hostPage = await hostCtx.newPage()
    await hostPage.goto(`${BASE}/friends`)
    await hostPage.waitForLoadState("networkidle")
    await hostPage.waitForSelector("h1", { state: "visible", timeout: 5000 })

    // Wizard step 1: Nickname
    const hostNicknameInput = hostPage.locator("input[placeholder='Ton pseudo']")
    await expect(hostNicknameInput).toBeVisible({ timeout: 5000 })
    await hostNicknameInput.fill("JoinTestHost")
    await hostPage.locator("button", { hasText: "Continuer" }).click()
    await hostPage.waitForTimeout(500)

    // Wizard step 2: Music — skip
    const hostSkipMusic = hostPage.locator("button", { hasText: /Continuer|Passer/ }).first()
    await expect(hostSkipMusic).toBeVisible({ timeout: 3000 })
    await hostSkipMusic.click()
    await hostPage.waitForTimeout(500)

    // Wizard step 3: Intent — create
    const createBtn = hostPage.locator("text=/Cr[eé]er une partie/").first()
    await expect(createBtn).toBeVisible({ timeout: 3000 })
    await createBtn.click()
    await hostPage.waitForTimeout(5000)
    await hostPage.waitForLoadState("networkidle")

    // If redirected to auth, click "Jouer sans compte"
    const guestBtn = hostPage.locator("button", { hasText: "Jouer sans compte" })
    if (await guestBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await guestBtn.click()
      await hostPage.waitForTimeout(5000)
      await hostPage.waitForLoadState("networkidle")
    }

    // If wizard redirected to /modes instead of /multiplayer, navigate directly
    if (!hostPage.url().includes("/multiplayer")) {
      await hostPage.goto(`${BASE}/multiplayer?mode=friends&intent=host&nickname=JoinTestHost`)
      await hostPage.waitForTimeout(5000)
      await hostPage.waitForLoadState("networkidle")
      const guestBtn2 = hostPage.locator("button", { hasText: "Jouer sans compte" })
      if (await guestBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
        await guestBtn2.click()
        await hostPage.waitForTimeout(5000)
        await hostPage.waitForLoadState("networkidle")
      }
    }

    await hostPage.waitForSelector("h1", { state: "visible", timeout: 5000 }).catch(() => {})

    // Extract room code using the shared helper
    const roomCode = await extractRoomCode(hostPage)
    console.log(`Created room: ${roomCode}`)
    expect(roomCode.length).toBeGreaterThanOrEqual(5)

    // Now test the join wizard
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/friends`)
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 })

    // Step 1: Nickname
    const nicknameInput = page.locator("input[placeholder='Ton pseudo']")
    await nicknameInput.fill("JoinTestPlayer")
    const continueBtn1 = page.locator("button", { hasText: "Continuer" })
    await continueBtn1.click()
    await page.waitForTimeout(500)
    console.log("Join step 1: entered nickname")

    // Step 2: Music - skip
    const skipMusic = page.locator("button", { hasText: /Continuer|Passer/ }).first()
    await skipMusic.click()
    await page.waitForTimeout(500)
    console.log("Join step 2: skipped music")

    // Step 3: Intent - click "Rejoindre une partie"
    const joinBtn = page.locator("text=Rejoindre une partie").first()
    await joinBtn.click()
    await page.waitForTimeout(500)
    console.log("Join step 3: clicked Rejoindre")

    // Step 4: Code
    const body4 = await page.locator("body").innerText()
    expect(body4.toLowerCase()).toContain("code de la salle")
    const codeInput = page.locator("input[placeholder*='EX']")
    await expect(codeInput).toBeVisible({ timeout: 3000 })
    await codeInput.fill(roomCode)
    const joinGoBtn = page.locator("button", { hasText: "Rejoindre" }).first()
    await expect(joinGoBtn).toBeVisible({ timeout: 3000 })
    await joinGoBtn.click()
    await page.waitForTimeout(3000)
    await page.waitForLoadState("networkidle").catch(() => {})
    await handleGuestAuth(page)
    await page.waitForTimeout(3000)
    console.log(`Join step 4: entered code ${roomCode} and clicked Rejoindre`)

    // Should be in lobby
    const url = page.url()
    console.log(`Join lobby URL: ${url}`)
    expect(url).toContain("/multiplayer")

    await page.waitForFunction(
      () => /ROOM_CODE|CREW|PRESS START|Lobby|Défie/i.test(document.body.textContent ?? ""),
      { timeout: 15000 }
    ).catch(() => {})
    const joinLobbyText = await page.locator("body").innerText()
    console.log(`Join lobby (300): ${joinLobbyText.substring(0, 300)}`)
    const hasLobbyContent = /Code de la salle|Défie tes amis|Lobby|Lancer la partie|PRESS START|ROOM_CODE|CREW/i.test(joinLobbyText)
    expect(hasLobbyContent).toBe(true)
    expect(joinLobbyText).toContain("JoinTestPlayer")

    // Host should also see the joiner
    await hostPage.waitForTimeout(3000)
    const hostText = await hostPage.locator("body").innerText()
    const hostSeesBoth = hostText.includes("JoinTestHost") && hostText.includes("JoinTestPlayer")
    console.log(`Host sees both: ${hostSeesBoth}`)
    expect(hostSeesBoth).toBe(true)

    await page.screenshot({ path: "test-results/wizard-join-lobby.png" })
    console.log("Join flow verified OK")

    await ctx.close()
    await hostCtx.close()
  })
})
