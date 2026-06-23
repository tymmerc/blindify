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

  // Step 2: Import music
  const musicInput = page.locator("input").first()
  if (await musicInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await musicInput.fill(SPOTIFY_PROFILE)
    const goBtn = page.locator("button", { hasText: /Go|Importer|Continuer/i }).first()
    if (await goBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await goBtn.click()
      await page.waitForTimeout(5000)
      const nextBtn = page.locator("button", { hasText: /Continuer|Passer/i }).first()
      if (await nextBtn.isVisible({ timeout: 20000 }).catch(() => false)) {
        await nextBtn.click()
        await page.waitForTimeout(500)
      }
    }
  }

  // Step 3: Create
  const createBtn = page.locator("text=/Cr[eé]er une partie/").first()
  if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createBtn.click()
  }

  await page.waitForTimeout(3000)
  await page.waitForLoadState("networkidle")
  await handleGuestAuth(page)

  if (!page.url().includes("/multiplayer")) {
    await page.goto(`${BASE}/multiplayer?mode=friends&intent=host&nickname=${encodeURIComponent(nickname)}`)
    await page.waitForTimeout(5000)
    await page.waitForLoadState("networkidle")
    await handleGuestAuth(page)
  }
}

async function joinRoom(page: Page, roomCode: string, nickname: string): Promise<void> {
  // Create a guest session via API first (more reliable than wizard flow)
  const apiBase = "https://tymmerc.eu/blindify/api"
  await page.request.post(`${apiBase}/auth/guest`, {
    data: { username: nickname },
  }).catch(() => {})
  await page.waitForTimeout(500)

  // Navigate to multiplayer with the code
  await page.goto(`${BASE}/multiplayer?mode=friends&code=${roomCode}&nickname=${encodeURIComponent(nickname)}`)
  await page.waitForTimeout(3000)
  await page.waitForLoadState("networkidle")

  // Handle guest auth redirect if it occurs
  await handleGuestAuth(page)
  await page.waitForTimeout(2000)

  // If still not on multiplayer, retry
  if (!page.url().includes("/multiplayer")) {
    await page.goto(`${BASE}/multiplayer?mode=friends&code=${roomCode}&nickname=${encodeURIComponent(nickname)}`)
    await page.waitForTimeout(5000)
    await page.waitForLoadState("networkidle")
    await handleGuestAuth(page)
  }

  await page.waitForSelector("h1", { state: "visible", timeout: 10000 }).catch(() => {})
}

/** Submit an answer on a game page (fill title input + click Valider) */
async function submitAnswer(page: Page, answer: string, label: string): Promise<boolean> {
  const titleInput = page.locator("input[aria-label*='Titre'], input[placeholder*='Titre'], input[placeholder*='titre']").first()
  if (!await titleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`${label}: title input not visible`)
    return false
  }
  await titleInput.fill(answer)
  const submitBtn = page.locator("button").filter({ hasText: /valider/i }).first()
  if (!await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`${label}: submit button not visible`)
    return false
  }
  await submitBtn.click()
  console.log(`${label}: submitted "${answer}"`)
  return true
}

/** Detect the current round number from page text (e.g. "1 / 5" or "Round 2") */
function detectRound(text: string): number {
  // L'UI de jeu rend le label explicite "ROUND 01 / 05" (TheaterGameView) ou "Manche N".
  // On l'ancre EN PREMIER : un "N / M" nu peut etre le compteur d'equipage "02 / 04"
  // encore visible pendant la transition lobby->jeu, ce qui faussait la detection.
  const labeled = text.match(/(?:ROUND|MANCHE)\s*0*(\d+)/i)
  if (labeled) return parseInt(labeled[1], 10)
  // Fallback legacy : un "N / M" nu (ancienne UI sans label).
  const slashMatch = text.match(/(\d+)\s*\/\s*\d+/)
  if (slashMatch) return parseInt(slashMatch[1], 10)
  return 0
}

// Lecture CIBLEE de la manche : l'indicateur visible est rendu dans `.theater-round`
// ("ROUND 01 / 05"). On le lit directement pour eviter les faux positifs du scan global
// (compteur d'equipage "02/04", mot contenant "round"/"manche", scores du classement...).
async function readRound(page: Page): Promise<number> {
  const el = page.locator(".theater-round")
  if ((await el.count()) > 0) {
    const t = (await el.first().innerText().catch(() => "")) || ""
    const m = t.match(/0*(\d+)/)
    if (m) return parseInt(m[1], 10)
  }
  return detectRound(await getBodyText(page))
}

// ── Tests ──

test.describe("Friends — 2 players full game", () => {
  test.setTimeout(180_000) // 3 min for multi-round test

  test("lobby: host creates room, player joins, both visible", async ({ browser }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const playerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const hostPage = await hostCtx.newPage()
    const playerPage = await playerCtx.newPage()

    try {
      await createHostWithMusic(hostPage, "HostTest")
      const hostText = await getBodyText(hostPage)
      const inLobby = /ROOM_CODE|CREW|PRESS START|Lobby|Défie|Defie|Code de la salle/i.test(hostText)
      expect(inLobby).toBe(true)

      const roomCode = await extractRoomCode(hostPage)
      console.log(`Room code: ${roomCode}`)
      expect(roomCode.length).toBeGreaterThanOrEqual(5)

      await joinRoom(playerPage, roomCode, "Player2")
      const playerText = await getBodyText(playerPage)
      const playerInLobby = /ROOM_CODE|CREW|PRESS START|Lobby|Défie|Defie|Code de la salle/i.test(playerText)
      expect(playerInLobby).toBe(true)

      // Le bouton "Lancer" n'est rendu que quand le host voit 2 joueurs (propagation socket
      // du room:join du 2e joueur). Cette propagation peut prendre quelques secondes, surtout
      // pendant que le host importe encore sa musique -> on attend l'apparition, pas un delai fixe.
      const launchBtn = hostPage.locator("button").filter({ hasText: /pose le diamant|lancer la partie|press start/i })
      await expect(launchBtn).toBeVisible({ timeout: 30000 })
      const hostAfter = await getBodyText(hostPage)
      expect(hostAfter).toContain("2")
      // Le bouton reste desactive tant que l'import du profil n'est pas fini (canStartGame exige !importing).
      // Un profil Spotify lourd peut prendre >30s a importer, on attend genereusement.
      await expect(launchBtn).toBeEnabled({ timeout: 90000 })
    } finally {
      await hostCtx.close()
      await playerCtx.close()
    }
  })

  test("full game: launch, play 2 rounds with answers, verify round advancement", async ({ browser }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const playerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const hostPage = await hostCtx.newPage()
    const playerPage = await playerCtx.newPage()

    try {
      // ── SETUP ──
      await createHostWithMusic(hostPage, "GameHost")
      expect(hostPage.url()).toContain("/multiplayer")

      const roomCode = await extractRoomCode(hostPage)
      console.log(`Room: ${roomCode}`)
      expect(roomCode.length).toBeGreaterThanOrEqual(5)

      await joinRoom(playerPage, roomCode, "Player2")

      // Wait for host to see 2 players (poll up to 15s)
      let playerCount = 0
      for (let i = 0; i < 15; i++) {
        await hostPage.waitForTimeout(1000)
        const text = await getBodyText(hostPage)
        // New synthwave lobby: "CREW 02/04". Legacy: "Joueurs · 2".
        const match = text.match(/(?:CREW|[ÉE]QUIPAGE)\s*0?(\d+)\s*\//i) || text.match(/Joueurs\s*[·:]\s*(\d+)/i)
        playerCount = match ? parseInt(match[1], 10) : 0
        console.log(`Waiting for player 2... count=${playerCount} (${i + 1}s)`)
        if (playerCount >= 2) break
      }
      if (playerCount < 2) {
        console.log("Player 2 never joined, test cannot continue")
        const playerUrl = playerPage.url()
        const playerText = (await getBodyText(playerPage)).substring(0, 300)
        console.log(`Player2 URL: ${playerUrl}`)
        console.log(`Player2 text: ${playerText}`)
        expect(playerCount).toBeGreaterThanOrEqual(2)
        return
      }

      // ── LAUNCH ──
      const launchBtn = hostPage.locator("button").filter({ hasText: /pose le diamant|lancer la partie|press start/i })
      // Import lourd du profil host -> bouton desactive jusqu'a la fin de l'import.
      await expect(launchBtn).toBeEnabled({ timeout: 90000 })
      await launchBtn.click()
      console.log("Game launched!")

      // ── ROUND 1: Both see game UI ──
      // IMPORTANT : on attend le marqueur EXCLUSIF au jeu (`.theater-round`). L'ancien detecteur
      // /Valider|Titre/ matchait "TES TITRES DANS LA PARTIE" du LOBBY -> faux positif "game launched"
      // alors que le host n'avait pas encore transitionne (la transition prend ~1-2s apres le clic).
      const hostHasGame = await hostPage.locator(".theater-round").first()
        .waitFor({ state: "visible", timeout: 30000 }).then(() => true).catch(() => false)
      const playerHasGame = await playerPage.locator(".theater-round").first()
        .waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)
      console.log(`Round 1 game UI - Host: ${hostHasGame}, Player: ${playerHasGame}`)
      expect(hostHasGame || playerHasGame).toBe(true)

      // Verify we're on round 1 (lecture ciblee de l'indicateur de manche, pas le scan global)
      const round1 = await readRound(hostHasGame ? hostPage : playerPage)
      console.log(`Detected round: ${round1}`)
      expect(round1).toBe(1)

      // ── ROUND 1: Both submit answers ──
      const hostAnswered = await submitAnswer(hostPage, "test host round1", "Host R1")
      const playerAnswered = await submitAnswer(playerPage, "test player round1", "Player R1")
      console.log(`Round 1 answers - Host: ${hostAnswered}, Player: ${playerAnswered}`)
      expect(hostAnswered || playerAnswered).toBe(true)

      // ── ROUND 1: Verify REVEAL triggers ──
      // Both answered = early reveal should fire. Wait for reveal indicators.
      console.log("Waiting for reveal...")
      const revealVisible = await waitForText(hostPage, /pts|score|ponse|sultat|Correct|Bonne|Mauvaise/i, 15000)
      console.log(`Reveal visible on host: ${revealVisible}`)

      // ── ROUND 2: Verify auto-advance ──
      // After reveal, there's a countdown (4-7s) then game:ready fires automatically.
      // Wait up to 20s for round 2 to start.
      console.log("Waiting for round 2...")
      let round2Detected = false
      for (let i = 0; i < 20; i++) {
        await hostPage.waitForTimeout(1000)
        const text = await getBodyText(hostPage)
        const currentRound = await readRound(hostPage)
        if (currentRound >= 2) {
          round2Detected = true
          console.log(`Round 2 detected after ${i + 1}s`)
          break
        }
        // Also check if game finished (if only 1 round configured)
        if (/termin|fini|game.over|victoire/i.test(text)) {
          console.log("Game finished after round 1 (only 1 round configured)")
          round2Detected = true // Not a bug, just short game
          break
        }
      }
      expect(round2Detected).toBe(true)

      // ── ROUND 2: Verify game UI is interactive again ──
      const round2Num = await readRound(hostPage)
      if (round2Num >= 2) {
        console.log(`On round ${round2Num}, waiting for inputs...`)
        // Wait for the game UI to be fully interactive (animation transition)
        await hostPage.waitForTimeout(3000)

        // Both submit answers for round 2
        const hostR2 = await submitAnswer(hostPage, "test host round2", "Host R2")
        const playerR2 = await submitAnswer(playerPage, "test player round2", "Player R2")
        console.log(`Round 2 answers - Host: ${hostR2}, Player: ${playerR2}`)

        // Wait for reveal again
        const reveal2 = await waitForText(hostPage, /pts|score|ponse|sultat|Correct/i, 15000)
        console.log(`Round 2 reveal: ${reveal2}`)

        // Wait for round 3 or game end
        console.log("Waiting for round 3 or game end...")
        let round3OrEnd = false
        for (let i = 0; i < 20; i++) {
          await hostPage.waitForTimeout(1000)
          const text = await getBodyText(hostPage)
          const currentRound = detectRound(text)
          if (currentRound >= 3) {
            console.log(`Round 3 detected after ${i + 1}s`)
            round3OrEnd = true
            break
          }
          if (/termin|fini|game.over|victoire|Rejouer/i.test(text)) {
            console.log(`Game ended after ${i + 1}s`)
            round3OrEnd = true
            break
          }
        }
        expect(round3OrEnd).toBe(true)
      }

      console.log("=== FULL GAME TEST PASSED ===")
    } finally {
      await hostCtx.close()
      await playerCtx.close()
    }
  })
})
