import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { CONTACT_EMAIL, CONTACT_MAILTO, DISCORD_SUPPORT_URL } from "./contact"

// T17c : le site ne publie plus l'adresse personnelle de Tym. Garde-fou sur
// tout le code du front (le dossier public et src), pas seulement les pages
// legales : une adresse Gmail ne doit revenir nulle part.
const ROOTS = [path.resolve(__dirname, ".."), path.resolve(__dirname, "../../public")]
const TEXT = /\.(tsx?|jsx?|mjs|json|html|txt|xml|webmanifest|md)$/

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return TEXT.test(e.name) ? [p] : []
  })
}

describe("contact", () => {
  it("une adresse sur le domaine, et l'invitation permanente du serveur", () => {
    expect(CONTACT_EMAIL).toBe("contact@blindz.app")
    expect(CONTACT_MAILTO).toBe("mailto:contact@blindz.app")
    expect(DISCORD_SUPPORT_URL).toBe("https://discord.gg/8pyAtVDFzU")
  })

  it("aucune adresse Gmail dans le front", () => {
    const self = path.resolve(__filename)
    const hits = ROOTS.flatMap(walk)
      .filter(f => path.resolve(f) !== self)
      .filter(f => /@gmail\./i.test(fs.readFileSync(f, "utf8")))
    expect(hits).toEqual([])
  })
})
