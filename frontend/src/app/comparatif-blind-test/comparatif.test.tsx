import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import Page from "./page"

// Le comparatif engage la parole de blindz.app sur les concurrents : chaque
// service a une ligne complete, chaque source externe est en nofollow, et
// Blinest (le concurrent le plus proche) y figure avec ses sources.
describe("comparatif des blind tests", () => {
  const renderPage = () => render(<Page />)

  const faqJsonLd = (container: HTMLElement) => {
    const blocks = [...container.querySelectorAll("script[type='application/ld+json']")]
      .map(s => JSON.parse(s.textContent || "{}"))
      .flatMap(o => (Array.isArray(o) ? o : [o]))
    return blocks.find(o => o?.["@type"] === "FAQPage")
  }

  const blinestRow = () => {
    const rows = within(screen.getByRole("table")).getAllByRole("row")
    const row = rows.find(r => within(r).queryAllByRole("cell")[0]?.textContent === "Blinest")
    if (!row) throw new Error("ligne Blinest absente du tableau")
    return row
  }

  it("a une ligne complete par service, Blinest compris", () => {
    renderPage()
    const table = screen.getByRole("table")
    const columns = within(table).getAllByRole("columnheader").length
    const rows = within(table).getAllByRole("row").slice(1)
    const names = rows.map(r => within(r).getAllByRole("cell")[0].textContent)
    expect(names).toEqual(expect.arrayContaining(["blindz.app", "Blinest", "blindtest.gg"]))
    for (const row of rows) {
      const cells = within(row).getAllByRole("cell")
      expect(cells.length).toBe(columns)
      for (const cell of cells) expect(cell.textContent?.trim()).not.toBe("")
    }
  })

  // Relecture du 05/10 : Blinest n'importe plus que Deezer (Spotify coupe, Apple
  // Music sert seulement a chercher des titres un par un). Leur ImportPlaylist.vue fait foi.
  it("ne pretend plus que Blinest importe Spotify ou Apple Music", () => {
    const { container } = renderPage()
    expect(blinestRow().textContent).toMatch(/Deezer/)
    expect(blinestRow().textContent).not.toMatch(/Spotify|Apple Music/)
    const fiche = screen.getByRole("heading", { level: 3, name: "Blinest" })
    const paragraphs: string[] = []
    for (let el = fiche.nextElementSibling; el && el.tagName === "P"; el = el.nextElementSibling) {
      paragraphs.push(el.textContent || "")
    }
    expect(paragraphs.join(" ")).toMatch(/plus d'import Spotify/)
    expect(paragraphs.join(" ")).not.toMatch(/Apple Music/)
    const answers = (faqJsonLd(container)?.mainEntity ?? []).map((q: { acceptedAnswer?: { text?: string } }) => q.acceptedAnswer?.text ?? "")
    for (const a of answers) expect(a).not.toMatch(/Apple Music/)
    const code = container.querySelector("a[href*='github.com/mchev/blinest'][href$='ImportPlaylist.vue']")
    expect(code).not.toBeNull()
  })

  it("met toutes les sources externes en noopener nofollow", () => {
    const { container } = renderPage()
    const external = [...container.querySelectorAll<HTMLAnchorElement>("a[href^='http']")]
    expect(external.length).toBeGreaterThan(5)
    for (const a of external) {
      expect(a.rel.split(" ")).toEqual(expect.arrayContaining(["noopener", "nofollow"]))
    }
  })

  it("donne une fiche Blinest avec des sources sur blinest.com", () => {
    const { container } = renderPage()
    expect(screen.getByRole("heading", { level: 3, name: "Blinest" })).toBeInTheDocument()
    const sources = [...container.querySelectorAll<HTMLAnchorElement>("a[href^='https://blinest.com']")]
    expect(sources.length).toBeGreaterThanOrEqual(3)
  })

  it("repond a la recherche « alternative a Blinest » dans le JSON-LD FAQPage", () => {
    const { container } = renderPage()
    const faq = faqJsonLd(container)
    expect(faq).toBeDefined()
    const questions: string[] = (faq?.mainEntity ?? []).map((q: { name?: string }) => q.name ?? "")
    expect(questions.some(q => /alternative à Blinest/.test(q))).toBe(true)
  })

  it("n'a aucun tiret cadratin", () => {
    const { container } = renderPage()
    expect(container.innerHTML).not.toContain("\u2014")
  })
})
