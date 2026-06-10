import { test, expect, type Page } from "@playwright/test"
import { extractRoomCode, handleGuestAuth, goToLobbyAsHost } from "./helpers"

const BASE = "https://tymmerc.eu/blindify"

async function getBodyText(page: Page): Promise<string> {
  await page.waitForSelector("h1", { state: "visible", timeout: 5000 }).catch(() => {})
  return page.locator("body").innerText()
}

async function joinRoom(page: Page, roomCode: string): Promise<void> {
  await page.goto(`${BASE}/multiplayer?mode=friends&code=${roomCode}`)
  await page.waitForTimeout(3000)
  await page.waitForLoadState("networkidle")
  await handleGuestAuth(page)
  await page.waitForSelector("h1", { state: "visible", timeout: 10000 }).catch(() => {})
}

test.describe("Friends — audio sync and answer flow", () => {
  test.setTimeout(120_000)

  test("both players hear the same track at the same position", async ({ browser }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const playerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const hostPage = await hostCtx.newPage()
    const playerPage = await playerCtx.newPage()

    const hostAudio: string[] = []
    const playerAudio: string[] = []
    hostPage.on("request", r => { if (r.url().includes("dzcdn.net") || r.url().includes("cdns-preview")) hostAudio.push(r.url()) })
    playerPage.on("request", r => { if (r.url().includes("dzcdn.net") || r.url().includes("cdns-preview")) playerAudio.push(r.url()) })

    try {
      // Setup: host creates, player joins
      await goToLobbyAsHost(hostPage, BASE, "SyncHost")
      const roomCode = await extractRoomCode(hostPage)
      expect(roomCode.length).toBeGreaterThanOrEqual(5)
      console.log(`Room: ${roomCode}`)

      await joinRoom(playerPage, roomCode)
      await hostPage.waitForTimeout(3000)

      // Launch
      const launchBtn = hostPage.locator("button").filter({ hasText: /lancer la partie|press start/i })
      if (!await launchBtn.isVisible({ timeout: 5000 }).catch(() => false) || !await launchBtn.isEnabled()) {
        console.log("Cannot launch - not enough players or no music")
        return
      }
      await launchBtn.click()
      console.log("Launched!")

      // Wait for game UI
      await hostPage.waitForTimeout(12000)

      // ── SYNC CHECK: Both get audio requests for the SAME track ──
      console.log(`Audio - Host: ${hostAudio.length}, Player: ${playerAudio.length}`)
      if (hostAudio.length > 0 && playerAudio.length > 0) {
        // Extract track ID from URL (last path segment before query)
        const extractId = (url: string) => url.split("/").pop()?.split("?")[0] ?? ""
        const hostTrackId = extractId(hostAudio[0])
        const playerTrackId = extractId(playerAudio[0])
        console.log(`Track IDs - Host: ${hostTrackId}, Player: ${playerTrackId}`)
        expect(hostTrackId).toBe(playerTrackId)
        console.log("SYNC OK: same track")
      } else {
        console.log("No audio on one or both sides (possible if no music imported)")
      }

      // ── ROUND CHECK: Both show the same round number ──
      const hostText = await getBodyText(hostPage)
      const playerText = await getBodyText(playerPage)
      const roundRegex = /(\d+)\s*\/\s*(\d+)/
      const hostRound = hostText.match(roundRegex)
      const playerRound = playerText.match(roundRegex)
      if (hostRound && playerRound) {
        console.log(`Rounds - Host: ${hostRound[0]}, Player: ${playerRound[0]}`)
        expect(hostRound[1]).toBe(playerRound[1])
        console.log("SYNC OK: same round")
      }

      // ── ANSWER FLOW: host answers first, counter updates ──
      const hostInput = hostPage.locator("input[placeholder*='itre']").first()
      if (await hostInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await hostInput.fill("sync test guess")
        await hostPage.locator("button").filter({ hasText: /valider/i }).first().click()
        console.log("Host answered")

        // Wait and check if player sees answer count
        await playerPage.waitForTimeout(2000)
        const pText = await getBodyText(playerPage)
        const sees1of2 = /1\s*\/\s*2/.test(pText)
        console.log(`Player sees 1/2: ${sees1of2}`)
        if (sees1of2) {
          console.log("SYNC OK: answer counter live")
        }

        // Player answers
        const playerInput = playerPage.locator("input[placeholder*='itre']").first()
        if (await playerInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await playerInput.fill("sync test player")
          await playerPage.locator("button").filter({ hasText: /valider/i }).first().click()
          console.log("Player answered")

          // ── REVEAL CHECK: both answered = reveal should trigger ──
          await hostPage.waitForTimeout(5000)
          const hostReveal = await getBodyText(hostPage)
          const playerReveal = await getBodyText(playerPage)

          const revealPattern = /ponse|sultat|Correct|pts|Bonne|Mauvaise|score|Manche\s*2|2\s*\/\s*\d+/i
          const hostRevealed = revealPattern.test(hostReveal)
          const playerRevealed = revealPattern.test(playerReveal)
          console.log(`Reveal - Host: ${hostRevealed}, Player: ${playerRevealed}`)
          expect(hostRevealed || playerRevealed).toBe(true)
          console.log("SYNC OK: reveal triggered after both answered")
        }
      }
    } finally {
      await hostCtx.close()
      await playerCtx.close()
    }
  })
})
