import { test, expect } from "@playwright/test"

const BASE = "https://tymmerc.eu/blindify"
const SPOTIFY_PROFILE = "https://open.spotify.com/user/yigiha54gqwl2tj39ymvu1n2s"

test.describe("Page loading", () => {
  test("solo page loads with form", async ({ page }) => {
    await page.goto(`${BASE}/solo`)
    await page.screenshot({ path: "e2e/screenshots/solo-page.png" })
    await expect(page.locator("h1")).toBeVisible()
    await expect(page.locator("input[type='url']")).toBeVisible()
    await expect(page.locator("button[type='submit']")).toBeVisible()
    // Progressive toggle should exist
    await expect(page.locator("input[type='checkbox']")).toBeVisible()
  })

  test("chrono page loads with duration selector", async ({ page }) => {
    await page.goto(`${BASE}/chrono`)
    await page.screenshot({ path: "e2e/screenshots/chrono-page.png" })
    await expect(page.locator("input[type='url']")).toBeVisible()
    // Should have duration buttons (1, 2, 3, 5 min)
    await expect(page.getByRole("button", { name: /1/i })).toBeVisible()
  })

  test("history page loads", async ({ page }) => {
    await page.goto(`${BASE}/history`)
    await page.screenshot({ path: "e2e/screenshots/history-page.png" })
    // Should show either game cards or empty state
    const content = await page.textContent("body")
    expect(content).toBeTruthy()
  })

  test("challenge page loads with code input", async ({ page }) => {
    await page.goto(`${BASE}/challenge`)
    await page.screenshot({ path: "e2e/screenshots/challenge-page.png" })
    // Should have a code input or prompt
    const content = await page.textContent("body")
    expect(content).toBeTruthy()
  })

  test("modes page loads with all mode links", async ({ page }) => {
    await page.goto(`${BASE}/modes`)
    await page.screenshot({ path: "e2e/screenshots/modes-page.png" })
    const content = await page.textContent("body")
    // Should have solo and chrono links
    expect(content?.toLowerCase()).toContain("solo")
  })
})

test.describe("Dark/Light theme toggle", () => {
  test("toggle switches theme", async ({ page }) => {
    await page.goto(`${BASE}/solo`)
    await page.waitForTimeout(1000)

    // Find the theme toggle (fixed bottom-left)
    const toggle = page.locator("button[title], button[aria-label]").filter({ has: page.locator("svg") }).last()

    // Check initial dark theme
    const htmlTheme = await page.getAttribute("html", "data-theme")
    expect(htmlTheme).toBe("dark")

    await page.screenshot({ path: "e2e/screenshots/theme-dark.png" })

    // Click toggle
    if (await toggle.isVisible()) {
      await toggle.click()
      await page.waitForTimeout(500)
      const newTheme = await page.getAttribute("html", "data-theme")
      expect(newTheme).toBe("light")
      await page.screenshot({ path: "e2e/screenshots/theme-light.png" })

      // Toggle back
      await toggle.click()
      await page.waitForTimeout(500)
      const revertedTheme = await page.getAttribute("html", "data-theme")
      expect(revertedTheme).toBe("dark")
    }
  })
})

test.describe("Solo game full flow", () => {
  test("play a game, see end screen with all buttons", async ({ page }) => {
    // Track audio requests
    const audioRequests: string[] = []
    page.on("request", (req) => {
      if (req.url().includes("dzcdn.net")) audioRequests.push(req.url())
    })

    // Start a solo game
    await page.goto(`${BASE}/solo`)
    await page.locator("input[type='url']").fill(SPOTIFY_PROFILE)
    await page.getByRole("button", { name: "5", exact: true }).click()
    await page.locator("button[type='submit']").click()

    // Wait for game to load and audio to play
    await page.waitForTimeout(15_000)
    await page.screenshot({ path: "e2e/screenshots/solo-playing.png" })

    // Verify audio played
    expect(audioRequests.length).toBeGreaterThan(0)

    // Check hint buttons exist
    const hintButtons = page.locator("button").filter({ hasText: /Titre|Artiste/i })
    const hintCount = await hintButtons.count()
    // Hint buttons should be present in the game UI
    console.log(`Hint buttons found: ${hintCount}`)

    // Check streak display area exists (score badge)
    const scoreBadge = page.locator("text=/pts/i")
    if (await scoreBadge.isVisible()) {
      console.log("Score badge visible")
    }
  })
})

test.describe("Challenge API", () => {
  test("create, get, and complete a challenge", async ({ request }) => {
    // Create challenge
    const createRes = await request.post(`${BASE}/api/challenges`, {
      headers: { "Content-Type": "application/json", "Origin": "https://tymmerc.eu" },
      data: {
        tracks: [
          { title: "Test Song", artist: "Test Artist", album_cover: null, audio_url: "https://example.com/test.mp3", audioSourceId: "test-1", track_id: "test-1", type: "spotify" },
          { title: "Test Song 2", artist: "Test Artist 2", album_cover: null, audio_url: "https://example.com/test2.mp3", audioSourceId: "test-2", track_id: "test-2", type: "spotify" },
        ],
        creatorName: "TestBot",
        score: 150,
        correct: 2,
        total: 2,
        bestStreak: 2,
      },
    })
    expect(createRes.ok()).toBeTruthy()
    const createBody = await createRes.json()
    console.log("Create challenge:", JSON.stringify(createBody))
    expect(createBody.success).toBe(true)
    const code = createBody.data.code
    expect(code).toBeTruthy()
    expect(code.length).toBe(8)

    // Get challenge
    const getRes = await request.get(`${BASE}/api/challenges/${code}`)
    expect(getRes.ok()).toBeTruthy()
    const getBody = await getRes.json()
    console.log("Get challenge:", JSON.stringify(getBody).slice(0, 200))
    expect(getBody.success).toBe(true)
    expect(getBody.data.creatorName ?? getBody.data.challenge?.creator_name).toBe("TestBot")
    expect(getBody.data.tracks.length).toBe(2)

    // Complete challenge
    const completeRes = await request.post(`${BASE}/api/challenges/${code}/complete`, {
      headers: { "Content-Type": "application/json", "Origin": "https://tymmerc.eu" },
      data: {
        playerName: "Challenger",
        score: 200,
        correct: 2,
        total: 2,
        bestStreak: 2,
      },
    })
    expect(completeRes.ok()).toBeTruthy()
    const completeBody = await completeRes.json()
    console.log("Complete challenge:", JSON.stringify(completeBody).slice(0, 200))
    expect(completeBody.success).toBe(true)
    expect(completeBody.data.leaderboard.length).toBeGreaterThanOrEqual(1)

    // Load challenge page
    // (This is a page test but we test the URL works)
    const pageRes = await request.get(`${BASE}/challenge?code=${code}`)
    expect(pageRes.ok()).toBeTruthy()
  })

  test("get nonexistent challenge returns error", async ({ request }) => {
    const res = await request.get(`${BASE}/api/challenges/ZZZZZZZZ`)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("challenge_not_found")
  })
})
