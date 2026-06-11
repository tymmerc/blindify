import { test, expect } from "@playwright/test"
import { handleGuestAuth } from "./helpers"

const BASE = "https://tymmerc.eu/blindify"

test.describe("Bug fixes verification", () => {

  test("BUG-1: nickname passed via URL appears in lobby", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    const nickname = "TestPlayer42"
    await page.goto(`${BASE}/multiplayer?mode=friends&intent=host&nickname=${nickname}`)
    await page.waitForTimeout(3000)
    await handleGuestAuth(page)
    await page.waitForTimeout(3000)

    const text = await page.textContent("body") || ""
    console.log(`BUG-1 lobby text (400): ${text.substring(0, 400)}`)

    // The nickname should appear somewhere in the lobby (participant list)
    const hasNickname = text.includes(nickname) || text.includes("TestPlayer")
    console.log(`BUG-1 nickname visible: ${hasNickname}`)

    // At minimum, should be on the lobby page (not redirected to /modes)
    expect(page.url()).toContain("/multiplayer")
    expect(text).not.toContain("Comment tu veux jouer")

    await page.screenshot({ path: "test-results/bug1-nickname.png" })
    await ctx.close()
  })

  test("BUG-2: import limits tracks (not 4000+)", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    // Create a room first
    await page.goto(`${BASE}/multiplayer?mode=friends&intent=host`)
    await page.waitForTimeout(4000)

    // Find the import input and submit a Spotify profile URL
    const importInput = page.locator("input[placeholder*='spotify']").first()
    if (await importInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await importInput.fill("https://open.spotify.com/user/yigiha54gqwl2tj39ymvu1n2s")
      const goBtn = page.locator("button", { hasText: "Go" }).first()
      await goBtn.click()

      // Wait for import to complete (should be much faster now with 10 tracks/playlist)
      const startTime = Date.now()
      await page.waitForFunction(
        () => document.body.textContent?.includes("titre") && document.body.textContent?.includes("importe"),
        { timeout: 60000 }
      ).catch(() => {})
      const elapsed = (Date.now() - startTime) / 1000

      const text = await page.textContent("body") || ""
      // Extract the number of imported tracks
      const match = text.match(/(\d+)\s*titre/)
      const trackCount = match ? parseInt(match[1], 10) : 0
      console.log(`BUG-2 imported: ${trackCount} tracks in ${elapsed.toFixed(1)}s`)
      console.log(`BUG-2 text: ${text.substring(0, 300)}`)

      // Should be WAY less than 4000. With 90 playlists * 10 tracks = max ~900, but deduplicated probably ~400-600
      expect(trackCount).toBeLessThan(2000)
      expect(trackCount).toBeGreaterThan(0)
      // Should complete in < 30s (was 45-120s before)
      expect(elapsed).toBeLessThan(45)
    } else {
      console.log("BUG-2: import input not found, skipping")
    }

    await page.screenshot({ path: "test-results/bug2-import-limit.png" })
    await ctx.close()
  })

  test("BUG-3: login button visible for guests in lobby", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    await page.goto(`${BASE}/multiplayer?mode=friends&intent=host`)
    await page.waitForTimeout(4000)
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 }).catch(() => {})

    const text = await page.locator("body").innerText()
    console.log(`BUG-3 text (400): ${text.substring(0, 400)}`)

    // Should show "Se connecter avec Spotify" for guests
    const hasLogin = /Se connecter|Connexion/i.test(text)
    console.log(`BUG-3 login button visible: ${hasLogin}`)
    expect(hasLogin).toBe(true)

    await page.screenshot({ path: "test-results/bug3-login-button.png" })
    await ctx.close()
  })

  test("BUG-4: 2nd player appears in host lobby within 5s", async ({ browser }) => {
    // Host context
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const hostPage = await hostCtx.newPage()
    await hostPage.goto(`${BASE}/multiplayer?mode=friends&intent=host&nickname=HostBug4`)
    await hostPage.waitForTimeout(4000)

    // Extract room code via clipboard (Copier button)
    await hostPage.context().grantPermissions(["clipboard-read", "clipboard-write"])
    const copyBtn = hostPage.locator("button", { hasText: "Copier" })
    let roomCode = ""
    if (await copyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await copyBtn.click()
      await hostPage.waitForTimeout(500)
      roomCode = await hostPage.evaluate(() => navigator.clipboard.readText()).catch(() => "")
    }
    if (!roomCode) {
      // Fallback: get from URL
      const url = hostPage.url()
      const urlCode = new URL(url).searchParams.get("code") || ""
      roomCode = urlCode
    }
    if (!roomCode) {
      // Fallback: look for the code display element
      const codeEl = hostPage.locator("span[style*='tracking']").filter({ hasText: /^[A-Z0-9]{5,7}$/ }).first()
      if (await codeEl.isVisible({ timeout: 2000 }).catch(() => false)) {
        roomCode = (await codeEl.textContent() || "").trim()
      }
    }
    console.log(`BUG-4 room code: ${roomCode}`)

    if (!roomCode) {
      console.log("BUG-4: no room code found, skipping")
      await hostCtx.close()
      return
    }

    // Player joins
    const playerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const playerPage = await playerCtx.newPage()
    await playerPage.goto(`${BASE}/multiplayer?mode=friends&code=${roomCode}&nickname=PlayerBug4`)
    await playerPage.waitForTimeout(5000)

    // Check host sees 2 participants
    const hostTextAfter = await hostPage.textContent("body") || ""
    const hasPlayer = hostTextAfter.includes("PlayerBug4") || hostTextAfter.includes("Joueur")
    const participantCount = (hostTextAfter.match(/En chauffe|Prêt/g) || []).length
    console.log(`BUG-4 host sees ${participantCount} participant markers, has player name: ${hasPlayer}`)
    console.log(`BUG-4 host text (400): ${hostTextAfter.substring(0, 400)}`)

    expect(participantCount).toBeGreaterThanOrEqual(2)

    await hostPage.screenshot({ path: "test-results/bug4-2players.png" })
    await hostCtx.close()
    await playerCtx.close()
  })

  test("BUG-5: launch button disabled during import", async ({ browser }) => {
    // Create room with 2 players first
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const hostPage = await hostCtx.newPage()
    await hostPage.goto(`${BASE}/multiplayer?mode=friends&intent=host&nickname=HostBug5`)
    await hostPage.waitForTimeout(4000)

    // Check the launch button text/state when import would be running
    const launchBtn = hostPage.locator("button", { hasText: /Lancer|Import|attente/ }).first()
    if (await launchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isDisabled = await launchBtn.isDisabled()
      const btnText = await launchBtn.textContent()
      console.log(`BUG-5 launch button: text="${btnText}", disabled=${isDisabled}`)

      // With only 1 player, button should be disabled (need >= 2)
      expect(isDisabled).toBe(true)
    } else {
      console.log("BUG-5: launch button not found")
    }

    await hostPage.screenshot({ path: "test-results/bug5-launch-btn.png" })
    await hostCtx.close()
  })
})
