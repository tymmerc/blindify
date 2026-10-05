import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { GUIDES } from "@/lib/guides"
import sitemap from "@/app/sitemap"

// Les guides sont des pages statiques sans logique : on verifie ici ce qui
// casse en silence (une page oubliee du sitemap, un titre copie-colle d'une
// page a l'autre, un tiret cadratin dans le texte).

const APP_DIR = path.resolve(__dirname, "../app")
const SITE = "https://blindz.app"
const source = (href: string) => fs.readFileSync(path.join(APP_DIR, href, "page.tsx"), "utf8")
const constant = (src: string, name: string) => new RegExp(`const ${name} =\\s*"([^"]+)"`).exec(src)?.[1]
// Le tiret cadratin est banni des textes du site (regle de copie de Tym).
const EM_DASH = String.fromCharCode(0x2014)
const metaTitle = (src: string) => /^\s{2}title: "([^"]+)"/m.exec(src)?.[1]

describe("guides", () => {
  it("chaque occasion de fete a sa propre page", () => {
    const hrefs = GUIDES.map(g => g.href)
    for (const href of ["/blind-test-soiree/", "/blind-test-anniversaire/", "/blind-test-evjf-evg/", "/blind-test-tv/", "/blind-test-entre-collegues/"]) {
      expect(hrefs).toContain(href)
    }
  })

  it("liens et libelles uniques, avec la barre finale de l'export statique", () => {
    expect(new Set(GUIDES.map(g => g.href)).size).toBe(GUIDES.length)
    expect(new Set(GUIDES.map(g => g.label)).size).toBe(GUIDES.length)
    for (const g of GUIDES) expect(g.href).toMatch(/^\/[a-z0-9-]+\/$/)
  })

  it("chaque guide a sa page et figure dans le sitemap", () => {
    const urls = sitemap().map(e => e.url)
    expect(new Set(urls).size).toBe(urls.length)
    for (const g of GUIDES) {
      expect(fs.existsSync(path.join(APP_DIR, g.href, "page.tsx")), g.href).toBe(true)
      expect(urls, g.href).toContain(SITE + g.href)
    }
  })

  it("URL canonique, titre et description propres a chaque page", () => {
    const seen = { title: new Set<string>(), meta: new Set<string>(), desc: new Set<string>() }
    for (const g of GUIDES) {
      const src = source(g.href)
      expect(constant(src, "URL"), g.href).toBe(SITE + g.href)
      const title = constant(src, "TITLE")
      const meta = metaTitle(src)
      const desc = constant(src, "DESC")
      expect(title && meta && desc, g.href).toBeTruthy()
      // Google coupe vers 160 caracteres : on tolere un peu plus (les premiers
      // guides font jusqu'a 204), le debut de la phrase doit porter le sens.
      expect(desc!.length, g.href).toBeGreaterThan(80)
      expect(desc!.length, g.href).toBeLessThanOrEqual(210)
      for (const [k, v] of [["title", title!], ["meta", meta!], ["desc", desc!]] as const) {
        expect(seen[k].has(v), `${k} en double : ${v}`).toBe(false)
        seen[k].add(v)
      }
    }
  })

  it("un seul H1 par page (celui du gabarit) et pas de tiret cadratin", () => {
    for (const g of GUIDES) {
      const src = source(g.href)
      expect(src, g.href).not.toMatch(/<h1/)
      expect(src, g.href).toMatch(/<GuideShell/)
      expect(src.includes(EM_DASH), g.href).toBe(false)
    }
  })
})
