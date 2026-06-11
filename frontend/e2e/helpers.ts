import type { Page, BrowserContext } from "@playwright/test"

/**
 * Handle auth redirect — if the page shows login, click "Jouer sans compte" to continue as guest.
 * Then wait for the lobby to load.
 */
export async function handleGuestAuth(page: Page): Promise<void> {
  const guestBtn = page.locator("button", { hasText: "Jouer sans compte" })
  if (await guestBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await guestBtn.click()
    await page.waitForTimeout(4000)
    await page.waitForLoadState("networkidle")
  }
}

/**
 * Navigate to multiplayer lobby as host, handling auth redirects.
 */
export async function goToLobbyAsHost(page: Page, base: string, nickname: string): Promise<void> {
  // Try wizard first
  await page.goto(`${base}/friends`)
  await page.waitForLoadState("networkidle")
  await page.waitForSelector("h1", { state: "visible", timeout: 5000 }).catch(() => {})

  const nicknameInput = page.locator("input[placeholder='Ton pseudo']")
  if (await nicknameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nicknameInput.fill(nickname)
    await page.locator("button", { hasText: "Continuer" }).click()
    await page.waitForTimeout(500)
    const skipMusic = page.locator("button", { hasText: /Continuer|Passer/ }).first()
    if (await skipMusic.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipMusic.click()
      await page.waitForTimeout(500)
    }
    const createBtn = page.locator("text=/Cr[eé]er une partie/").first()
    if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createBtn.click()
      await page.waitForTimeout(3000)
      await page.waitForLoadState("networkidle")
    }
  }

  // Handle auth redirect
  await handleGuestAuth(page)

  // If still not on multiplayer, navigate directly
  if (!page.url().includes("/multiplayer")) {
    await page.goto(`${base}/multiplayer?mode=friends&intent=host&nickname=${encodeURIComponent(nickname)}`)
    await page.waitForTimeout(3000)
    await page.waitForLoadState("networkidle")
    await handleGuestAuth(page)
  }

  await page.waitForSelector("h1", { state: "visible", timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(1000)
}

/**
 * Extract room code from lobby page.
 * Tries: DOM structure first, then regex on text, then clipboard.
 */
export async function extractRoomCode(page: Page): Promise<string> {
  // Strategy 1: Look for the code element after "Code de la salle" label
  try {
    const codeSection = page.locator("text=Code de la salle").first()
    if (await codeSection.isVisible({ timeout: 3000 })) {
      // Get the parent container and find the code text (next <p> sibling)
      const parent = codeSection.locator("..")
      const paragraphs = parent.locator("p")
      const count = await paragraphs.count()
      for (let i = 0; i < count; i++) {
        const text = (await paragraphs.nth(i).innerText()).trim()
        // Room code: 5-8 chars from charset ABCDEFGHJKLMNPQRSTUVWXYZ23456789
        if (text.length >= 5 && text.length <= 8 && /^[A-Z0-9]+$/.test(text) && text !== "CODE") {
          return text
        }
      }
    }
  } catch {}

  // Strategy 2: Clipboard via "Code" or "Copier" button
  try {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
    const copyBtn = page.locator("button").filter({ hasText: /^(Code|Copier)$/i }).first()
    if (await copyBtn.isVisible({ timeout: 2000 })) {
      await copyBtn.click()
      await page.waitForTimeout(500)
      const code = await page.evaluate(() => navigator.clipboard.readText())
      if (code && code.trim().length >= 5 && /^[A-Z0-9]+$/.test(code.trim())) return code.trim()
    }
  } catch {}

  // Strategy 3: Regex fallback — codes have at least one digit (distinguishes from words)
  try {
    const text = await page.locator("body").innerText()
    const matches = text.match(/\b([A-HJ-NP-Z2-9]{5,8})\b/g) || []
    // Filter: must contain at least one digit
    const withDigit = matches.filter(m => /\d/.test(m))
    if (withDigit.length > 0) return withDigit[0]
  } catch {}

  // Strategy 4: Tile rendering (analog DA) — letters spaced out like "H 4 X L W Z".
  // The spaced-single-char pattern is distinctive enough that we don't require
  // a digit (room codes CAN be all letters, e.g. "YKFJMR"); we require exactly
  // 6 chars (room_code is varchar(6)).
  try {
    const text = await page.locator("body").innerText()
    const tiles = text.match(/(?:\b[A-HJ-NP-Z2-9][ \t\n]+){5}[A-HJ-NP-Z2-9]\b/)
    if (tiles) {
      const joined = tiles[0].replace(/\s+/g, "")
      if (joined.length === 6) return joined
    }
  } catch {}

  return ""
}
