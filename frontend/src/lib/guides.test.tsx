import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import type { Metadata } from "next"
import type { ComponentType } from "react"
import { GUIDES } from "@/lib/guides"
import sitemap from "@/app/sitemap"

// Les guides sont des pages statiques sans logique : on verifie ici ce qui
// casse en silence. Une page oubliee de la liste ou du sitemap, un lien
// interne mort, un JSON-LD illisible, une date de mise a jour changee a un
// endroit sur trois, un titre copie-colle d'une page a l'autre, un tiret
// cadratin. Les pages sont rendues pour de vrai, comme dans l'export.

const APP_DIR = path.resolve(__dirname, "../app")
const SITE = "https://blindz.app"
// Le tiret cadratin est banni des textes du site (regle de copie de Tym).
const EM_DASH = String.fromCharCode(0x2014)
// layout.tsx ajoute " · blindz.app" au titre : Google en affiche une soixantaine.
const TITLE_SUFFIX = " · blindz.app"
const TITLE_MAX = 60
const DESC_MAX = 160
// Le comparatif garde son titre et sa description longs tant que la PR #49,
// qui reecrit cette page, n'est pas fusionnee. A raccourcir ensuite.
const LIMIT_EXCEPTIONS: Record<string, { title: number; desc: number }> = {
  "/comparatif-blind-test/": { title: 66, desc: 200 },
}
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]

type PageModule = { default: ComponentType; metadata: Metadata }

async function renderGuide(href: string) {
  const slug = href.replace(/\//g, "")
  const mod: PageModule = await import(`../app/${slug}/page.tsx`)
  const { container, unmount } = render(<mod.default />)
  const jsonLd = [...container.querySelectorAll("script[type='application/ld+json']")].map(s => JSON.parse(s.textContent || ""))
  return { mod, container, jsonLd, unmount }
}

// "/blind-test-tv/?x#y" -> app/blind-test-tv/page.tsx ; "/" -> app/page.tsx
const pageFileFor = (href: string) => path.join(APP_DIR, href.split(/[?#]/)[0], "page.tsx")

// "Mis à jour le 5 octobre 2026" -> "2026-10-05"
function visibleDate(text: string): string | null {
  const m = /Mis à jour le (\d{1,2})(?:er)? (\p{L}+) (\d{4})/u.exec(text)
  const month = m ? MONTHS.indexOf(m[2]) + 1 : 0
  if (!m || month === 0) return null
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

describe("guides", () => {
  it("chaque page blind-test-* de app/ est dans la liste des guides", () => {
    const hrefs = GUIDES.map(g => g.href)
    const dirs = fs.readdirSync(APP_DIR).filter(d => /^(blind-test-|comparatif-)/.test(d) && fs.existsSync(path.join(APP_DIR, d, "page.tsx")))
    expect(dirs.length).toBeGreaterThan(0)
    for (const d of dirs) expect(hrefs, `app/${d} absent de lib/guides`).toContain(`/${d}/`)
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
      expect(fs.existsSync(pageFileFor(g.href)), g.href).toBe(true)
      expect(urls, g.href).toContain(SITE + g.href)
    }
  })

  it("URL canonique, titre et description propres a chaque page, aux bonnes longueurs", async () => {
    const seen = { title: new Set<string>(), og: new Set<string>(), desc: new Set<string>() }
    for (const g of GUIDES) {
      const { mod, unmount } = await renderGuide(g.href)
      unmount()
      const { alternates, openGraph } = mod.metadata
      expect(alternates?.canonical, g.href).toBe(SITE + g.href)
      expect(openGraph?.url, g.href).toBe(SITE + g.href)
      const title = String(mod.metadata.title ?? "")
      const desc = String(mod.metadata.description ?? "")
      const og = String(openGraph?.title ?? "")
      const limits = LIMIT_EXCEPTIONS[g.href] ?? { title: TITLE_MAX, desc: DESC_MAX }
      expect(title && og, g.href).toBeTruthy()
      expect((title + TITLE_SUFFIX).length, `titre trop long : ${title}`).toBeLessThanOrEqual(limits.title)
      expect(desc.length, `description de ${g.href}`).toBeGreaterThan(80)
      expect(desc.length, `description de ${g.href}`).toBeLessThanOrEqual(limits.desc)
      for (const [k, v] of [["title", title], ["og", og], ["desc", desc]] as const) {
        expect(seen[k].has(v), `${k} en double : ${v}`).toBe(false)
        seen[k].add(v)
      }
    }
  })

  it("un seul H1, pas de tiret cadratin, JSON-LD lisible avec une FAQ non vide et visible", async () => {
    for (const g of GUIDES) {
      const { container, jsonLd, unmount } = await renderGuide(g.href)
      const text = container.textContent ?? ""
      expect(container.querySelectorAll("h1").length, g.href).toBe(1)
      expect(text.includes(EM_DASH), `${g.href} : tiret cadratin`).toBe(false)
      expect(JSON.stringify(jsonLd).includes(EM_DASH), `${g.href} : tiret cadratin dans le JSON-LD`).toBe(false)
      const webPage = jsonLd.find(o => o["@type"] === "WebPage")
      expect(webPage?.url, g.href).toBe(SITE + g.href)
      const faq = jsonLd.find(o => o["@type"] === "FAQPage")
      expect(faq?.mainEntity?.length ?? 0, `${g.href} : FAQ vide`).toBeGreaterThan(0)
      for (const q of faq.mainEntity) {
        expect(q.name && q.acceptedAnswer?.text, g.href).toBeTruthy()
        // Google demande que la FAQ balisee soit aussi lisible sur la page.
        expect(text, `${g.href} : question absente de la page`).toContain(q.name)
      }
      unmount()
    }
  })

  it("les liens internes de chaque guide menent a une page qui existe", async () => {
    for (const g of GUIDES) {
      const { container, unmount } = await renderGuide(g.href)
      const hrefs = [...container.querySelectorAll("a[href]")].map(a => a.getAttribute("href")!)
      const internal = hrefs.filter(h => h.startsWith("/") && !h.startsWith("//"))
      expect(internal.length, g.href).toBeGreaterThan(0)
      for (const h of internal) expect(fs.existsSync(pageFileFor(h)), `${g.href} -> ${h}`).toBe(true)
      unmount()
    }
  })

  it("la date de mise a jour est la meme sur la page, dans le JSON-LD et dans le sitemap", async () => {
    const lastModified = new Map(sitemap().map(e => [e.url, e.lastModified]))
    for (const g of GUIDES) {
      const { container, jsonLd, unmount } = await renderGuide(g.href)
      const shown = visibleDate(container.textContent ?? "")
      unmount()
      const inSitemap = lastModified.get(SITE + g.href)
      expect(shown, `${g.href} : date visible illisible`).not.toBeNull()
      expect(jsonLd.find(o => o["@type"] === "WebPage")?.dateModified, `${g.href} : JSON-LD`).toBe(shown)
      expect(inSitemap && new Date(inSitemap).toISOString().slice(0, 10), `${g.href} : sitemap`).toBe(shown)
    }
  })
})
