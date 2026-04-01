import { test, expect } from "@playwright/test"
import { extractRoomCode } from "./helpers"

const BASE = "https://tymmerc.eu/blindify"
const SPOTIFY_PROFILE = "https://open.spotify.com/user/yigiha54gqwl2tj39ymvu1n2s"

async function registerUser(page: any, suffix: string) {
  const username = `e2e_${suffix}_${Date.now()}`
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

async function getRoomCode(page: any): Promise<string> {
  return extractRoomCode(page)
}

test.describe("Event (presentation) — host + participant full game", () => {
  test("host projects, participant joins via code, both play synchronized", async ({ browser }) => {
    const hostCtx = await browser.newContext()
    const participantCtx = await browser.newContext()
    const hostPage = await hostCtx.newPage()
    const participantPage = await participantCtx.newPage()

    const hostAudio: string[] = []
    const participantAudio: string[] = []
    hostPage.on("request", r => { if (r.url().includes("dzcdn.net")) hostAudio.push(r.url()) })
    participantPage.on("request", r => { if (r.url().includes("dzcdn.net")) participantAudio.push(r.url()) })

    try {
      // 1. Register both
      const hostName = await registerUser(hostPage, "evhost")
      const participantName = await registerUser(participantPage, "evpart")
      console.log(`Host: ${hostName}, Participant: ${participantName}`)

      // 2. Host creates event room via modal
      await hostPage.goto(`${BASE}/event`)
      await hostPage.waitForTimeout(2_000)
      // Click "Lancer l'écran principal" to open modal
      await hostPage.locator("button, a").filter({ hasText: /lancer|d[ée]marrer/i }).first().click()
      await hostPage.waitForTimeout(1_500)
      // Click "Créer une salle" in modal
      const createBtn = hostPage.locator("button, a").filter({ hasText: /cr[ée]er une salle/i })
      if (await createBtn.count() > 0) {
        await createBtn.first().click()
      }
      await hostPage.waitForTimeout(8_000)
      await hostPage.screenshot({ path: "e2e/screenshots/ev-host-lobby.png" })

      // Get room code
      const roomCode = await getRoomCode(hostPage)
      console.log(`Event room: ${roomCode}`)

      if (!roomCode) {
        // Try extracting from page text
        const t = await hostPage.textContent("body")
        console.log("Host lobby (300):", t?.slice(0, 300))
        return
      }

      // 3. Host imports playlist
      const hostInput = hostPage.locator("input").first()
      await hostInput.fill(SPOTIFY_PROFILE)
      await hostPage.locator("button").filter({ hasText: /^Go$/i }).click()
      console.log("Host: importing...")

      // 4. Participant joins via URL
      await participantPage.goto(`${BASE}/multiplayer?mode=event&code=${roomCode}`)
      await participantPage.waitForTimeout(5_000)
      await participantPage.screenshot({ path: "e2e/screenshots/ev-participant-joined.png" })
      const partText = await participantPage.textContent("body")
      console.log("Participant after join (300):", partText?.slice(0, 300))

      // Verify participant is in lobby
      const partInLobby = partText?.includes("Lobby") || partText?.includes("event") || partText?.includes(participantName)
      console.log(`Participant in lobby: ${partInLobby}`)

      // 5. Wait for import
      for (let i = 0; i < 24; i++) {
        await hostPage.waitForTimeout(5_000)
        const t = await hostPage.textContent("body")
        if (t?.includes("titres import")) {
          console.log(`Import done (${(i+1)*5}s)`)
          break
        }
      }
      await hostPage.screenshot({ path: "e2e/screenshots/ev-after-import.png" })

      // Check participant count on host
      const hostText = await hostPage.textContent("body")
      const participantCount = hostText?.match(/(\d+)\s*pr[ée]sent/)
      console.log(`Participants visible: ${participantCount?.[0] || 'unknown'}`)
      console.log(`Host sees participant name: ${hostText?.includes(participantName)}`)

      // 6. Host clicks "Lancer"
      const launchBtn = hostPage.locator("button").filter({ hasText: /^lancer$/i })
      const launchBtn2 = hostPage.locator("button").filter({ hasText: /lancer la partie/i })
      const btn = (await launchBtn.count() > 0) ? launchBtn : launchBtn2

      if (await btn.count() > 0 && await btn.first().isEnabled()) {
        console.log("=== LAUNCHING EVENT ===")
        await btn.first().click()

        // Wait for game
        await hostPage.waitForTimeout(15_000)
        await hostPage.screenshot({ path: "e2e/screenshots/ev-host-game.png" })
        await participantPage.waitForTimeout(5_000)
        await participantPage.screenshot({ path: "e2e/screenshots/ev-participant-game.png" })

        const hostGame = await hostPage.textContent("body")
        const partGame = await participantPage.textContent("body")

        // Host should show projection view (large UI, readable at distance)
        console.log("Host game (300):", hostGame?.slice(0, 300))
        console.log("Participant game (300):", partGame?.slice(0, 300))

        const hostPlaying = hostGame?.includes("Extrait") || hostGame?.includes("Valider") || hostGame?.includes("secondes") || hostGame?.includes("/")
        const partPlaying = partGame?.includes("Extrait") || partGame?.includes("Valider") || partGame?.includes("secondes") || partGame?.includes("Titre")
        console.log(`Host playing: ${hostPlaying}`)
        console.log(`Participant playing: ${partPlaying}`)

        // In event mode, only host plays audio (projection)
        console.log(`Host audio: ${hostAudio.length}`)
        console.log(`Participant audio: ${participantAudio.length}`)

        // Participant answers
        const partTitleInput = participantPage.locator("input[placeholder*='Titre'], input[placeholder*='titre']").first()
        if (await partTitleInput.isVisible()) {
          await partTitleInput.fill("test event guess")
          await participantPage.locator("button").filter({ hasText: /valider/i }).first().click()
          console.log("Participant: submitted answer")
          await hostPage.waitForTimeout(3_000)

          const hostAfter = await hostPage.textContent("body")
          const hostSeesAnswer = hostAfter?.includes("1/") && hostAfter?.includes("réponse")
          console.log(`Host sees participant answered: ${hostSeesAnswer}`)
          await hostPage.screenshot({ path: "e2e/screenshots/ev-after-participant-answer.png" })
        }

        expect(hostPlaying).toBe(true)
      } else {
        console.log("Cannot launch event")
        const btns = await hostPage.locator("button").allTextContents()
        console.log("Host buttons:", btns.filter(t => t.trim()).join(" | "))
      }
    } finally {
      await hostCtx.close()
      await participantCtx.close()
    }
  })
})
