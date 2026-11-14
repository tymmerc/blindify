import { describe, expect, it } from "vitest"
import { API_BASE_URL } from "./config"
import { avatarInitial, avatarSrc } from "./photo"

describe("avatarSrc", () => {
  it("complete une photo Blindz avec l'adresse de l'API", () => {
    expect(avatarSrc("/api/photos/0f8fad5b-d9cb-469f-a165-70867728950e.webp")).toBe(
      `${API_BASE_URL}/api/photos/0f8fad5b-d9cb-469f-a165-70867728950e.webp`
    )
  })

  it("garde un avatar Discord tel quel", () => {
    const discord = "https://cdn.discordapp.com/avatars/123/abc.png?size=128"
    expect(avatarSrc(discord)).toBe(discord)
  })

  it("n'affiche rien d'autre", () => {
    expect(avatarSrc(null)).toBeNull()
    expect(avatarSrc("")).toBeNull()
    expect(avatarSrc("javascript:alert(1)")).toBeNull()
    expect(avatarSrc("http://exemple.test/photo.png")).toBeNull()
    expect(avatarSrc("data:image/png;base64,AAAA")).toBeNull()
  })
})

describe("avatarInitial", () => {
  it("prend la premiere lettre, en majuscule", () => {
    expect(avatarInitial("  lila")).toBe("L")
    expect(avatarInitial("éva")).toBe("É")
  })

  it("un emoji compte pour une lettre, un nom vide donne ?", () => {
    expect(avatarInitial("🎧 Max")).toBe("🎧")
    expect(avatarInitial("   ")).toBe("?")
    expect(avatarInitial(null)).toBe("?")
  })
})
