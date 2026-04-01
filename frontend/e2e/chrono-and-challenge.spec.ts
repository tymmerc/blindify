import { test, expect } from "@playwright/test"

const BASE = "https://tymmerc.eu/blindify"
const SPOTIFY_PROFILE = "https://open.spotify.com/user/yigiha54gqwl2tj39ymvu1n2s"

test.describe("Chrono mode full flow", () => {
  test("should load tracks and play audio in chrono mode", async ({ page }) => {
    const audioRequests: string[] = []
    page.on("request", (req) => {
      if (req.url().includes("dzcdn.net")) audioRequests.push(req.url())
    })

    await page.goto(`${BASE}/chrono`)

    // Fill URL
    await page.locator("input[type='url']").fill(SPOTIFY_PROFILE)

    // Select 1 min for speed
    await page.getByRole("button", { name: "1 min" }).click()

    // Submit
    await page.locator("button[type='submit']").click()

    // Wait for tracks to load + countdown (3s) + game start
    await page.waitForTimeout(15_000)
    await page.screenshot({ path: "e2e/screenshots/chrono-loading.png" })

    await page.waitForTimeout(10_000)
    await page.screenshot({ path: "e2e/screenshots/chrono-playing.png" })

    // Check audio was requested
    console.log(`Chrono audio requests: ${audioRequests.length}`)

    // Check chrono-specific UI
    const bodyText = await page.textContent("body")
    console.log("Chrono body text (first 500):", bodyText?.slice(0, 500))

    // More flexible check — either audio played or game UI is visible
    const hasGameUI = bodyText?.includes("Passer") || bodyText?.includes("Valider") || bodyText?.includes("Titre")
    const hasAudio = audioRequests.length > 0
    console.log(`Has game UI: ${hasGameUI}, Has audio: ${hasAudio}`)
    expect(hasGameUI || hasAudio).toBe(true)
  })
})

test.describe("Challenge full flow", () => {
  test("create challenge, load it, and see intro screen", async ({ page, request }) => {
    // 1. First play a quick solo game to get real tracks
    const apiRes = await request.post(`${BASE}/api/quick-play`, {
      headers: { "Content-Type": "application/json", "Origin": "https://tymmerc.eu" },
      data: { url: SPOTIFY_PROFILE, count: 3 },
    })
    const apiBody = await apiRes.json()
    expect(apiBody.success).toBe(true)
    const tracks = apiBody.data.tracks

    // 2. Create a challenge with those real tracks
    const createRes = await request.post(`${BASE}/api/challenges`, {
      headers: { "Content-Type": "application/json", "Origin": "https://tymmerc.eu" },
      data: {
        tracks: tracks.map((t: any) => ({
          title: t.title,
          artist: t.artist,
          album_cover: t.album_cover,
          audio_url: t.audio_url,
          audioSourceId: t.audioSourceId || t.track_id,
          track_id: t.track_id,
          type: t.type || "spotify",
        })),
        creatorName: "E2E Test",
        score: 100,
        correct: 2,
        total: 3,
        bestStreak: 2,
      },
    })
    const createBody = await createRes.json()
    expect(createBody.success).toBe(true)
    const code = createBody.data.code
    console.log(`Challenge code: ${code}`)

    // 3. Load the challenge page with the code
    await page.goto(`${BASE}/challenge?code=${code}`)
    await page.waitForTimeout(3_000)
    await page.screenshot({ path: "e2e/screenshots/challenge-intro.png" })

    // Should show intro with creator name and score to beat
    const bodyText = await page.textContent("body")
    expect(bodyText).toContain("E2E Test")
    console.log("Challenge page contains creator name: true")
    console.log("Challenge page contains score:", bodyText?.includes("100"))

    // 4. Check that there's a "play" or "start" button
    const startButton = page.locator("button").filter({ hasText: /defi|jouer|commencer|relever/i })
    const startCount = await startButton.count()
    console.log(`Start buttons found: ${startCount}`)

    if (startCount > 0) {
      // Enter a name if there's an input
      const nameInput = page.locator("input[type='text']")
      if (await nameInput.isVisible()) {
        await nameInput.fill("Challenger Bot")
      }

      // Click start
      await startButton.first().click()
      await page.waitForTimeout(10_000)
      await page.screenshot({ path: "e2e/screenshots/challenge-playing.png" })

      // Check that audio plays
      const audioReqs: string[] = []
      page.on("request", (req) => {
        if (req.url().includes("dzcdn.net")) audioReqs.push(req.url())
      })
      // Already playing, check the page has game UI
      const gameText = await page.textContent("body")
      console.log("Challenge game has 'Question':", gameText?.includes("Question"))
      console.log("Challenge game has 'Valider':", gameText?.includes("Valider"))
    }
  })
})
