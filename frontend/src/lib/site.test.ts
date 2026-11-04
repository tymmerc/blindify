import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { metadata as home } from "@/app/page"
import { DISCORD_SUPPORT_URL } from "./contact"
import { SITE_ALTERNATE_NAMES, SITE_NAME, SITE_SAME_AS, SITE_URL, organizationJsonLd, websiteJsonLd } from "./site"

// T23 : Google doit comprendre que « Blindz » est le nom de ce site. Le nom
// du WebSite, le debut du titre de l'accueil et og:site_name disent la meme
// chose, et les profils cites existent vraiment.

const PUBLIC_DIR = path.resolve(__dirname, "../../public")
const EM_DASH = String.fromCharCode(0x2014)

describe("nom du site", () => {
  it("Blindz, avec le domaine en nom alternatif", () => {
    expect(SITE_NAME).toBe("Blindz")
    expect(SITE_URL).toBe("https://blindz.app/")
    expect(SITE_ALTERNATE_NAMES).toContain("blindz.app")
    expect(SITE_ALTERNATE_NAMES).not.toContain(SITE_NAME)
  })

  it("WebSite et Organization pointent l'un vers l'autre", () => {
    const site = websiteJsonLd()
    const org = organizationJsonLd()
    expect(site["@type"]).toBe("WebSite")
    expect(site.name).toBe("Blindz")
    expect(site.url).toBe(SITE_URL)
    expect(org["@type"]).toBe("Organization")
    expect(org.name).toBe("Blindz")
    expect(site.publisher["@id"]).toBe(org["@id"])
    expect(JSON.stringify([site, org]).includes(EM_DASH)).toBe(false)
  })

  it("le logo est un fichier servi par le site", () => {
    const logo = organizationJsonLd().logo
    expect(logo.startsWith(SITE_URL)).toBe(true)
    expect(fs.existsSync(path.join(PUBLIC_DIR, logo.slice(SITE_URL.length)))).toBe(true)
  })

  it("seulement des profils publics connus", () => {
    expect([...SITE_SAME_AS]).toEqual([DISCORD_SUPPORT_URL, "https://github.com/tymmerc/blindify"])
  })

  it("l'accueil commence par le nom et le reprend dans og:site_name", () => {
    const title = typeof home.title === "object" && home.title && "absolute" in home.title ? home.title.absolute : home.title
    expect(String(title)).toMatch(/^Blindz : /)
    expect(String(title).length).toBeLessThanOrEqual(60)
    expect(String(title).includes(EM_DASH)).toBe(false)
    expect(home.openGraph?.siteName).toBe("Blindz")
    expect(String(home.description)).toMatch(/^Blindz /)
  })
})
