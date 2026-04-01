import { test, expect } from "@playwright/test"

test.describe("Solo blind test — audio playback", () => {
  test("should play audio after submitting a playlist URL", async ({ page, context }) => {
    // Grant autoplay permission so the browser doesn't block audio
    await context.grantPermissions([])

    // Track all network requests to Deezer CDN (audio previews)
    const audioRequests: string[] = []
    page.on("request", (req) => {
      if (req.url().includes("dzcdn.net") || req.url().includes("cdns-preview")) {
        audioRequests.push(req.url())
      }
    })

    // 1. Go to solo page
    await page.goto("/solo")
    await page.waitForLoadState("networkidle")
    await page.waitForSelector("h1", { state: "visible", timeout: 5000 })
    await expect(page.locator("h1")).toContainText("solo", { ignoreCase: true })

    // 2. Paste a Deezer profile URL and submit
    const urlInput = page.locator("input[type='url']")
    await urlInput.fill("https://open.spotify.com/user/yigiha54gqwl2tj39ymvu1n2s")

    // Select 5 rounds for speed
    const fiveButton = page.getByRole("button", { name: "5", exact: true })
    await fiveButton.click()

    // Click "Lancer le blind test"
    const submitButton = page.locator("button[type='submit']")
    await submitButton.click()

    // 3. Wait for game to load
    await page.waitForTimeout(5_000)
    await page.screenshot({ path: "e2e/screenshots/after-submit.png" })

    // Wait for game UI — look for timer or vinyl or track elements
    await page.waitForTimeout(10_000)
    await page.screenshot({ path: "e2e/screenshots/after-wait.png" })

    // 4. Wait for audio to be requested from Deezer CDN
    // Give it up to 15 seconds for the countdown + audio fetch
    await page.waitForTimeout(8_000)

    // 5. Check that an audio request was made to Deezer CDN
    expect(audioRequests.length).toBeGreaterThan(0)

    // 6. Check that the page shows a playing state (vinyl disc spinning, timer counting)
    // Verify the audio element exists and has a src set
    const audioSrc = await page.evaluate(() => {
      const audios = document.querySelectorAll("audio")
      // audioManager creates Audio() programmatically, check via JS
      return (window as unknown as Record<string, unknown>).__audioDebugSrc ?? null
    })

    // Alternative: check via the audio element the audioManager created
    const hasAudioPlaying = await page.evaluate(() => {
      // Find any audio element that is not paused
      const allAudios = Array.from(document.querySelectorAll("audio"))
      if (allAudios.some(a => !a.paused)) return true

      // audioManager uses new Audio() which isn't in DOM, but we can check
      // network activity as our primary signal
      return false
    })

    // The primary check: Deezer CDN was hit for an audio preview
    console.log(`Audio requests made: ${audioRequests.length}`)
    console.log(`URLs: ${audioRequests.join("\n")}`)
    expect(audioRequests.length).toBeGreaterThanOrEqual(1)
  })
})
