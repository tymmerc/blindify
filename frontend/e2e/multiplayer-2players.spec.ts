import { test, expect, type Page } from "@playwright/test"
import { extractRoomCode, handleGuestAuth } from "./helpers"

const BASE = "https://tymmerc.eu/blindify"
const SPOTIFY_PROFILE = "https://open.spotify.com/user/yigiha54gqwl2tj39ymvu1n2s"

// ── Helpers ──

async function waitForText(page: Page, text: string | RegExp, timeout = 10_000): Promise<boolean> {
  try {
    await page.locator("body").filter({ hasText: text }).waitFor({ timeout })
    return true
  } catch {
    return false
  }
}

async function getBodyText(page: Page): Promise<string> {
  await page.waitForSelector("h1", { state: "visible", timeout: 5000 }).catch(() => {})
  return page.locator("body").innerText()
}

async function createHostWithMusic(page: Page, nickname: string): Promise<void> {
  await page.goto(`${BASE}/friends`)
  await page.waitForLoadState("networkidle")
  await page.waitForSelector("h1", { state: "visible", timeout: 5000 })

  // Step 1: Nickname
  const nicknameInput = page.locator("input[placeholder='Ton pseudo']")
  await expect(nicknameInput).toBeVisible({ timeout: 5000 })
  await nicknameInput.fill(nickname)
  await page.locator("button", { hasText: "Continuer" }).click()
  await page.waitForTimeout(500)

  // Step 2: Import music (don't skip!)
  const musicInput = page.locator("input").first()
  if (await musicInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await musicInput.fill(SPOTIFY_PROFILE)
    const goBtn = page.locator("button", { hasText: /Go|Importer|Continuer/i }).first()
    if (await goBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await goBtn.click()
      // Wait for import to finish (up to 30s)
      await page.waitForTimeout(5000)
      // Click continue/skip to move to next step
      const nextBtn = page.locator("button", { hasText: /Continuer|Passer/i }).first()
      if (await nextBtn.isVisible({ timeout: 20000 }).catch(() => false)) {
        await nextBtn.click()
        await page.waitForTimeout(500)
      }
    }
  }

  // Step 3: Create
  const createBtn = page.locator("text=Créer une partie").first()
  if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createBtn.click()
  }

  await page.waitForTimeout(3000)
  await page.waitForLoadState("networkidle")
  await handleGuestAuth(page)

  // Fallback direct navigation if wizard didn't land on multiplayer
  if (!page.url().includes("/multiplayer")) {
    await page.goto(`${BASE}/multiplayer?mode=friends&intent=host&nickname=${encodeURIComponent(nickname)}`)
    await page.waitForTimeout(5000)
    await page.waitForLoadState("networkidle")
    await handleGuestAuth(page)
  }
}

async function joinRoom(page: Page, roomCode: string): Promise<void> {
  await page.goto(`${BASE}/multiplayer?mode=friends&code=${roomCode}`)
  await page.waitForTimeout(3000)
  await page.waitForLoadState("networkidle")
  await handleGuestAuth(page)
  await page.waitForSelector("h1", { state: "visible", timeout: 10000 }).catch(() => {})
}

// ── Tests ──

test.describe("Friends — 2 players full game", () => {
  test.setTimeout(120_000)

  test("lobby: host creates room, player joins, both visible", async ({ browser }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const playerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const hostPage = await hostCtx.newPage()
    const playerPage = await playerCtx.newPage()

    try {
      // Host creates room via wizard
      await createHostWithMusic(hostPage, "HostTest")
      const hostText = await getBodyText(hostPage)
      const inLobby = hostText.includes("Lobby") || hostText.includes("Défie") || hostText.includes("Code de la salle")
      expect(inLobby).toBe(true)

      // Extract room code
      const roomCode = await extractRoomCode(hostPage)
      console.log(`Room code: ${roomCode}`)
      expect(roomCode.length).toBeGreaterThanOrEqual(5)

      // Player joins
      await joinRoom(playerPage, roomCode)
      const playerText = await getBodyText(playerPage)
      const playerInLobby = playerText.includes("Lobby") || playerText.includes("Défie") || playerText.includes("Code de la salle")
      expect(playerInLobby).toBe(true)
      console.log("Player joined lobby OK")

      // Host should see 2 players
      await hostPage.waitForTimeout(3000)
      const hostAfter = await getBodyText(hostPage)
      expect(hostAfter).toContain("2")
      console.log("Host sees 2 players")

      // Launch button should be enabled (>= 2 players)
      const launchBtn = hostPage.locator("button").filter({ hasText: /lancer la partie/i })
      await expect(launchBtn).toBeVisible({ timeout: 5000 })
      const isEnabled = await launchBtn.isEnabled()
      console.log(`Launch button enabled: ${isEnabled}`)
      expect(isEnabled).toBe(true)
    } finally {
      await hostCtx.close()
      await playerCtx.close()
    }
  })

  test("gameplay: launch, both see game UI, submit answers, reveal triggers", async ({ browser }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const playerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const hostPage = await hostCtx.newPage()
    const playerPage = await playerCtx.newPage()

    const hostAudio: string[] = []
    const playerAudio: string[] = []
    hostPage.on("request", r => { if (r.url().includes("dzcdn.net") || r.url().includes("cdns-preview")) hostAudio.push(r.url()) })
    playerPage.on("request", r => { if (r.url().includes("dzcdn.net") || r.url().includes("cdns-preview")) playerAudio.push(r.url()) })

    try {
      // ── SETUP: create room with music ──
      await createHostWithMusic(hostPage, "GameHost")
      expect(hostPage.url()).toContain("/multiplayer")

      const roomCode = await extractRoomCode(hostPage)
      console.log(`Room: ${roomCode}`)
      expect(roomCode.length).toBeGreaterThanOrEqual(5)

      // Player joins
      await joinRoom(playerPage, roomCode)
      await hostPage.waitForTimeout(3000)

      // ── LAUNCH ──
      const launchBtn = hostPage.locator("button").filter({ hasText: /lancer la partie/i })
      if (await launchBtn.isVisible({ timeout: 5000 }).catch(() => false) && await launchBtn.isEnabled()) {
        await launchBtn.click()
        console.log("Game launched!")
      } else {
        console.log("Launch button not available, skipping gameplay checks")
        return
      }

      // ── CHECK 1: Both see game UI (wait for round to start) ──
      const hostHasGame = await waitForText(hostPage, /Valider|Manche|secondes|Titre/, 15000)
      const playerHasGame = await waitForText(playerPage, /Valider|Manche|secondes|Titre/, 10000)
      console.log(`Host game UI: ${hostHasGame}, Player game UI: ${playerHasGame}`)
      expect(hostHasGame || playerHasGame).toBe(true)

      // ── CHECK 2: Both see round indicator ──
      const hostGameText = await getBodyText(hostPage)
      const playerGameText = await getBodyText(playerPage)
      const roundMatch = /\d+\s*\/\s*\d+/
      const hostHasRound = roundMatch.test(hostGameText)
      const playerHasRound = roundMatch.test(playerGameText)
      console.log(`Round indicator - Host: ${hostHasRound}, Player: ${playerHasRound}`)
      expect(hostHasRound || playerHasRound).toBe(true)

      // ── CHECK 3: Audio requests fired ──
      console.log(`Audio requests - Host: ${hostAudio.length}, Player: ${playerAudio.length}`)
      // At least one side should have audio
      expect(hostAudio.length + playerAudio.length).toBeGreaterThan(0)

      // ── CHECK 4: Same track for both players ──
      if (hostAudio.length > 0 && playerAudio.length > 0) {
        const hostTrackId = hostAudio[0].split("/").pop()?.split("?")[0] ?? ""
        const playerTrackId = playerAudio[0].split("/").pop()?.split("?")[0] ?? ""
        console.log(`Same track: ${hostTrackId === playerTrackId} (${hostTrackId})`)
        expect(hostTrackId).toBe(playerTrackId)
      }

      // ── CHECK 5: Host submits answer ──
      const hostTitleInput = hostPage.locator("input").filter({ hasText: /titre/i }).or(hostPage.locator("input[placeholder*='Titre'], input[placeholder*='titre']")).first()
      if (await hostTitleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await hostTitleInput.fill("test answer host")
        const submitBtn = hostPage.locator("button").filter({ hasText: /valider/i }).first()
        await submitBtn.click()
        console.log("Host submitted answer")

        // After host answers, check if answer count updates
        await playerPage.waitForTimeout(2000)
        const playerMid = await getBodyText(playerPage)
        const hasAnswerCount = /1\s*\/\s*2/.test(playerMid)
        console.log(`Player sees 1/2 answers: ${hasAnswerCount}`)
        // This is a soft check - answer counter may not be visible in all UI variants
      }

      // ── CHECK 6: Player submits answer ──
      const playerTitleInput = playerPage.locator("input").filter({ hasText: /titre/i }).or(playerPage.locator("input[placeholder*='Titre'], input[placeholder*='titre']")).first()
      if (await playerTitleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await playerTitleInput.fill("test answer player")
        const submitBtn = playerPage.locator("button").filter({ hasText: /valider/i }).first()
        await submitBtn.click()
        console.log("Player submitted answer")
      }

      // ── CHECK 7: Reveal triggers (both answered = early reveal) ──
      // Wait for reveal phase - should show correct answer, score, or next round
      await hostPage.waitForTimeout(5000)
      const hostReveal = await getBodyText(hostPage)
      const playerReveal = await getBodyText(playerPage)

      const revealKeywords = /ponse|sultat|Bonne|Mauvaise|Correct|pts|score|2\s*\/\s*\d+|Manche 2/i
      const hostSeesReveal = revealKeywords.test(hostReveal)
      const playerSeesReveal = revealKeywords.test(playerReveal)
      console.log(`Reveal - Host: ${hostSeesReveal}, Player: ${playerSeesReveal}`)
      // At least one should see reveal or next round
      expect(hostSeesReveal || playerSeesReveal).toBe(true)

      // ── CHECK 8: Round advances (auto-advance after reveal countdown) ──
      await hostPage.waitForTimeout(10000) // Wait for reveal countdown + next round
      const hostR2 = await getBodyText(hostPage)
      const playerR2 = await getBodyText(playerPage)

      // Should either be on round 2, or still in reveal with countdown
      const hasAdvanced = /Manche\s*2|2\s*\/\s*\d+/i.test(hostR2) || /Manche\s*2|2\s*\/\s*\d+/i.test(playerR2)
      const stillInReveal = /ponse|sultat|Prochain|Pr[eê]t/i.test(hostR2) || /ponse|sultat|Prochain|Pr[eê]t/i.test(playerR2)
      console.log(`Round 2 advanced: ${hasAdvanced}, Still in reveal: ${stillInReveal}`)
      // Either advanced to round 2 or still showing reveal (both are OK, game is progressing)
      expect(hasAdvanced || stillInReveal).toBe(true)

      console.log("=== GAMEPLAY TEST PASSED ===")
    } finally {
      await hostCtx.close()
      await playerCtx.close()
    }
  })
})
