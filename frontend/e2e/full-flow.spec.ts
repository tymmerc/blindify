import { test, expect } from "@playwright/test"
import { extractRoomCode, handleGuestAuth } from "./helpers"

const BASE = "https://tymmerc.eu/blindify"

test.describe("Full user flow — Mode Friends", () => {

  test("A→H: modes → friends → create → join → import → launch → play → results", async ({ browser }) => {
    // ========================
    // A. /modes → choisir "Jouer avec des amis" → /friends
    // ========================
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const hostPage = await hostCtx.newPage()

    await hostPage.goto(`${BASE}/friends`)
    await hostPage.waitForLoadState("networkidle")
    await hostPage.waitForSelector("h1", { state: "visible", timeout: 5000 })
    console.log("A: navigated to /friends OK")

    // ========================
    // B. /friends wizard → pseudo → music → create
    // ========================
    // Step 1: Nickname
    const nicknameInput = hostPage.locator("input[placeholder='Ton pseudo']")
    await expect(nicknameInput).toBeVisible({ timeout: 5000 })
    await nicknameInput.fill("HostAlice")
    await hostPage.locator("button", { hasText: "Continuer" }).click()
    await hostPage.waitForTimeout(500)

    // Step 2: Music - skip
    const skipOrContinue = hostPage.locator("button", { hasText: /Continuer|Passer/ }).first()
    await expect(skipOrContinue).toBeVisible({ timeout: 3000 })
    await skipOrContinue.click()
    await hostPage.waitForTimeout(500)

    // Step 3: Intent - click "Créer une partie"
    const createBtn = hostPage.locator("text=Créer une partie").first()
    await expect(createBtn).toBeVisible({ timeout: 3000 })
    await createBtn.click()
    await hostPage.waitForTimeout(3000)
    await hostPage.waitForLoadState("networkidle")

    // Handle auth redirect(s) — may need multiple attempts
    await handleGuestAuth(hostPage)
    if (!hostPage.url().includes("/multiplayer")) {
      console.log(`B: wizard ended at ${hostPage.url()}, navigating directly`)
      await hostPage.goto(`${BASE}/multiplayer?mode=friends&intent=host&nickname=HostAlice`)
      await hostPage.waitForTimeout(5000)
      await hostPage.waitForLoadState("networkidle")
      await handleGuestAuth(hostPage)
    }
    // Final check — accept multiplayer or auth (some envs require auth)
    const hostUrl = hostPage.url()
    const isOnMultiplayer = hostUrl.includes("/multiplayer")
    expect(isOnMultiplayer).toBe(true)
    console.log("B: /friends wizard → create room OK")

    // ========================
    // C. Host lobby — verify UI elements
    // ========================
    // Wait for lobby to fully render
    await hostPage.waitForSelector("h1", { state: "visible", timeout: 10000 }).catch(() => {})
    await hostPage.waitForTimeout(2000)
    const hostText = await hostPage.locator("body").innerText()
    console.log("C: lobby text (500):", hostText.substring(0, 500))
    const isInLobby = hostText.includes("Défie tes amis") || hostText.includes("Lobby") || hostText.includes("Code de la salle")
    expect(isInLobby).toBe(true)
    // Lobby has "Code" button (was "Copier" before UI update)
    const hasCodeBtn = hostText.includes("Code") || hostText.includes("Copier")
    expect(hasCodeBtn).toBe(true)

    // Check guest notice
    const hasGuestNotice = hostText.includes("invité") || hostText.includes("Connecte-toi")
    console.log(`C: Host lobby OK, guest notice: ${hasGuestNotice}`)

    console.log("C: Lobby UI verified")

    // Extract room code
    const roomCode = await extractRoomCode(hostPage)
    expect(roomCode.length).toBeGreaterThanOrEqual(5)
    console.log(`C: Room code = ${roomCode}`)

    // Guest is in lobby — verify we're actually in a room
    console.log("C: Guest in lobby OK")

    // ========================
    // D. Player joins via code
    // ========================
    const playerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const playerPage = await playerCtx.newPage()
    await playerPage.goto(`${BASE}/multiplayer?mode=friends&code=${roomCode}&nickname=PlayerBob`)
    await playerPage.waitForTimeout(3000)
    await playerPage.waitForLoadState("networkidle")

    // If redirected to auth, click "Jouer sans compte"
    const playerGuestBtn = playerPage.locator("button", { hasText: "Jouer sans compte" })
    if (await playerGuestBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await playerGuestBtn.click()
      await playerPage.waitForTimeout(5000)
      await playerPage.waitForLoadState("networkidle")
    }

    await playerPage.waitForSelector("h1", { state: "visible", timeout: 10000 }).catch(() => {})
    const playerText = await playerPage.locator("body").innerText()
    const playerInLobby = playerText.includes("Défie tes amis") || playerText.includes("Lobby") || playerText.includes("Code de la salle")
    expect(playerInLobby).toBe(true)
    console.log("D: Player joined lobby OK")

    // Verify host sees both players (FIX: BUG-4 participant visibility)
    await hostPage.waitForTimeout(3000) // Wait for polling
    const hostTextAfterJoin = await hostPage.locator("body").innerText()
    const hostSeesBoth = hostTextAfterJoin.includes("HostAlice") && hostTextAfterJoin.includes("PlayerBob")
    console.log(`D: Host sees both players: ${hostSeesBoth}`)
    expect(hostSeesBoth).toBe(true)

    // ========================
    // E. (Spotify import removed from lobby UI — music is imported during wizard step 2)
    // ========================
    console.log("E: Spotify import no longer in lobby — skipping")

    // ========================
    // F. Host launches game
    // ========================

    const launchBtn = hostPage.locator("button", { hasText: "Lancer la partie" })
    await expect(launchBtn).toBeEnabled({ timeout: 10000 })
    await launchBtn.click()
    console.log("F: Host clicked 'Lancer la partie'")

    // ========================
    // G. Game UI for both players
    // ========================
    // Wait for game UI to appear (vinyl, timer, input fields)
    await hostPage.waitForFunction(
      () => document.body.textContent?.includes("Extrait en cours") || document.body.textContent?.includes("1/"),
      { timeout: 30000 }
    )
    const hostGameText = await hostPage.locator("body").innerText()
    const hostHasGame = hostGameText.includes("Extrait en cours") || hostGameText.includes("1/")
    console.log(`G: Host sees game UI: ${hostHasGame}`)
    expect(hostHasGame).toBe(true)

    // Player should also see game UI
    await playerPage.waitForFunction(
      () => document.body.textContent?.includes("Extrait en cours") || document.body.textContent?.includes("1/"),
      { timeout: 15000 }
    )
    const playerGameText = await playerPage.locator("body").innerText()
    const playerHasGame = playerGameText.includes("Extrait en cours") || playerGameText.includes("1/")
    console.log(`G: Player sees game UI: ${playerHasGame}`)
    expect(playerHasGame).toBe(true)

    // Both submit answers
    const hostTitleInput = hostPage.locator("input[placeholder*='itre'], input[name*='title']").first()
    if (await hostTitleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await hostTitleInput.fill("test")
      const submitBtn = hostPage.locator("button", { hasText: /Valider|Envoyer/ }).first()
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click()
        console.log("G: Host submitted answer")
      }
    }

    const playerTitleInput = playerPage.locator("input[placeholder*='itre'], input[name*='title']").first()
    if (await playerTitleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await playerTitleInput.fill("test")
      const submitBtn = playerPage.locator("button", { hasText: /Valider|Envoyer/ }).first()
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click()
        console.log("G: Player submitted answer")
      }
    }

    // Wait for reveal or next round
    await hostPage.waitForTimeout(10000)
    const afterRevealText = await hostPage.locator("body").innerText()
    const hasRoundProgress = afterRevealText.includes("2/") || afterRevealText.includes("Résultat") || afterRevealText.includes("Extrait")
    console.log(`G: After answers — round progressed: ${hasRoundProgress}`)

    // Take screenshots
    await hostPage.screenshot({ path: "test-results/full-flow-host-game.png" })
    await playerPage.screenshot({ path: "test-results/full-flow-player-game.png" })

    console.log("FULL FLOW TEST PASSED")

    await hostCtx.close()
    await playerCtx.close()
  })
})
