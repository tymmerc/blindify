import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import Page from "./page"

// Le comparatif engage la parole de blindz.app sur les concurrents : chaque
// service a une ligne complete, chaque source externe est en nofollow, et
// Blinest (le concurrent le plus proche) y figure avec ses sources.
describe("comparatif des blind tests", () => {
  const renderPage = () => render(<Page />)

  it("a une ligne complete par service, Blinest compris", () => {
    renderPage()
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1)
    const names = rows.map(r => within(r).getAllByRole("cell")[0].textContent)
    expect(names).toContain("Blinest")
    expect(names).toHaveLength(7)
    for (const row of rows) {
      const cells = within(row).getAllByRole("cell")
      expect(cells).toHaveLength(8)
      for (const cell of cells) expect(cell.textContent?.trim()).not.toBe("")
    }
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
    const ld = [...container.querySelectorAll("script[type='application/ld+json']")].map(s => JSON.parse(s.textContent || "{}"))
    const faq = ld.find(o => o["@type"] === "FAQPage")
    const questions: string[] = faq.mainEntity.map((q: { name: string }) => q.name)
    expect(questions.some(q => /alternative à Blinest/.test(q))).toBe(true)
  })

  it("n'a aucun tiret cadratin", () => {
    const { container } = renderPage()
    expect(container.innerHTML).not.toContain("\u2014")
  })
})
