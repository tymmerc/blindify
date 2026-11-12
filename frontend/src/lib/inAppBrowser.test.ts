import { describe, expect, it } from "vitest"
import { inAppBrowserName, regularBrowserName } from "./inAppBrowser"

// User-Agents releves dans les journaux du 05/11/2026 (soiree de la bande).
const SNAP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0.1 Mobile/15E148 Snapchat/14.30.0.59 (like Safari/8625.1.29.10.33, panda)"
const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0.1 Mobile/15E148 Safari/604.1"
const ECOSIA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Mobile/15E148 Safari/604.1 (Ecosia ios@12.5.0.3262)"
const INSTA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0"
const MESSENGER_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 [FB_IAB/MESSENGER;FBAV/480.0.0.0;]"
const FACEBOOK = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]"
const TIKTOK = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 musical_ly_2023"
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"

describe("inAppBrowserName", () => {
  it("reconnait les applis vues ou courantes", () => {
    expect(inAppBrowserName(SNAP)).toBe("Snapchat")
    expect(inAppBrowserName(INSTA)).toBe("Instagram")
    expect(inAppBrowserName(MESSENGER_ANDROID)).toBe("Messenger")
    expect(inAppBrowserName(FACEBOOK)).toBe("Facebook")
    expect(inAppBrowserName(TIKTOK)).toBe("TikTok")
  })

  it("laisse tranquilles les vrais navigateurs, Ecosia compris", () => {
    expect(inAppBrowserName(SAFARI)).toBeNull()
    expect(inAppBrowserName(ECOSIA)).toBeNull()
    expect(inAppBrowserName(CHROME_ANDROID)).toBeNull()
    expect(inAppBrowserName("")).toBeNull()
    expect(inAppBrowserName(undefined)).toBeNull()
  })
})

describe("regularBrowserName", () => {
  it("Safari sur iPhone, sinon un mot generique", () => {
    expect(regularBrowserName(SNAP)).toBe("Safari")
    expect(regularBrowserName(MESSENGER_ANDROID)).toBe("ton navigateur")
  })
})
