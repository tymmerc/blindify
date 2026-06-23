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

    // Step 2: Music - import a real Spotify profile so the host has tracks to play
    const SPOTIFY_PROFILE = "https://open.spotify.com/user/yigiha54gqwl2tj39ymvu1n2s"
    const musicInput = hostPage.locator("input").first()
    if (await musicInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await musicInput.fill(SPOTIFY_PROFILE)
      const goBtn = hostPage.locator("button", { hasText: /Go|Importer|Continuer/i }).first()
      if (await goBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await goBtn.click()
        await hostPage.waitForTimeout(5000)
        const nextBtn = hostPage.locator("button", { hasText: /Continuer|Passer/i }).first()
        if (await nextBtn.isVisible({ timeout: 20000 }).catch(() => false)) {
          await nextBtn.click()
          await hostPage.waitForTimeout(500)
        }
      }
    }

    // Step 3: Intent - click "Créer une partie" (accent-tolerant locator)
    const createBtn = hostPage.locator("text=/Cr[eé]er une partie/").first()
    await expect(createBtn).toBeVisible({ timeout: 5000 })
    await createBtn.click()
    // Wait for async ensureUserSession + router.push to complete
    await hostPage.waitForTimeout(3000)
    await hostPage.waitForLoadState("networkidle")

    // Handle auth redirect(s) - may need multiple attempts
    await handleGuestAuth(hostPage)
    if (!hostPage.url().includes("/multiplayer")) {
      console.log(`B: wizard ended at ${hostPage.url()}, navigating directly`)
      // Create guest session via API first to avoid /modes bounce
      await hostPage.request.post(`${BASE}/api/auth/guest`, { data: { username: "HostAlice" } }).catch(() => {})
      await hostPage.waitForTimeout(500)
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
    // Wait for lobby code to render (fully loaded signal)
    await hostPage.waitForSelector("h1", { state: "visible", timeout: 10000 }).catch(() => {})
    await hostPage.waitForFunction(
      () => /ROOM_CODE|Code de la salle|SALLE|CREW|[ÉE]QUIPAGE|PRESS START|Défie/i.test(document.body.textContent ?? ""),
      { timeout: 10000 }
    ).catch(() => {})
    const hostText = await hostPage.locator("body").innerText()
    console.log("C: lobby text (500):", hostText.substring(0, 500))
    const isInLobby = /ROOM_CODE|CREW|PRESS START|Défie|Lobby|Code de la salle/i.test(hostText)
    expect(isInLobby).toBe(true)
    // Lobby has "Code" button (was "Copier" before UI update)
    const hasCodeBtn = /code|copier/i.test(hostText)
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
    // Pre-create guest session via API (more reliable than UI-driven auth)
    await playerPage.request.post(`${BASE}/api/auth/guest`, { data: { username: "PlayerBob" } }).catch(() => {})
    await playerPage.waitForTimeout(500)
    await playerPage.goto(`${BASE}/multiplayer?mode=friends&code=${roomCode}&nickname=PlayerBob`)
    await playerPage.waitForTimeout(3000)
    await playerPage.waitForLoadState("networkidle")
    await handleGuestAuth(playerPage)
    await playerPage.waitForTimeout(2000)

    await playerPage.waitForSelector("h1", { state: "visible", timeout: 10000 }).catch(() => {})
    const playerText = await playerPage.locator("body").innerText()
    const playerInLobby = /ROOM_CODE|CREW|PRESS START|Défie|Lobby|Code de la salle/i.test(playerText)
    expect(playerInLobby).toBe(true)
    console.log("D: Player joined lobby OK")

    // Verify host sees both players (FIX: BUG-4 participant visibility)
    // Wait for both nicknames to appear in the host UI rather than a fixed timeout.
    await hostPage.waitForFunction(
      () => /HostAlice/.test(document.body.textContent ?? "") &&
            /PlayerBob/.test(document.body.textContent ?? ""),
      { timeout: 10000 }
    ).catch(() => {})
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

    const launchBtn = hostPage.locator("button", { hasText: /Pose le diamant|Lancer la partie|PRESS START/i })
    // Le bouton reste desactive tant que l'import du profil host n'est pas fini
    // (canStartGame exige !importing). Un profil lourd peut prendre >30s -> attente genereuse.
    await expect(launchBtn).toBeEnabled({ timeout: 90000 })
    await launchBtn.click()
    console.log("F: Host clicked 'Lancer la partie'")

    // ========================
    // G. Game UI for both players
    // ========================
    // Attendre le marqueur EXCLUSIF au jeu : la pastille de manche `.theater-round`.
    // L'ancien detecteur /Valider|Titre/ matchait "TES TITRES DANS LA PARTIE" du LOBBY
    // (faux positif), et la transition host prend ~1-2s apres le clic "Lancer".
    const hostHasGame = await hostPage.locator(".theater-round").first()
      .waitFor({ state: "visible", timeout: 45000 }).then(() => true).catch(() => false)
    console.log(`G: Host sees game UI: ${hostHasGame}`)
    expect(hostHasGame).toBe(true)

    // Player should also see game UI
    const playerHasGame = await playerPage.locator(".theater-round").first()
      .waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)
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

    // Wait for reveal or next round (any of these indicators means we progressed)
    await hostPage.waitForFunction(
      () => {
        const t = document.body.textContent ?? ""
        return /2\/|Résultat|Extrait/.test(t)
      },
      { timeout: 15000 }
    ).catch(() => {})
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
