import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import FaqPage from "./page"

// La question sur la beta : visible dans l'accordeon, presente dans le JSON-LD
// FAQPage (ce que citent les moteurs), et elle dit ou signaler un souci.
describe("FAQ : question beta", () => {
  const QUESTION = "Pourquoi blindz.app est marqué « bêta » ?"

  it("affiche la question et sa reponse", () => {
    render(<FaqPage />)
    const summary = screen.getByText(QUESTION)
    const answer = summary.closest("details")?.textContent ?? ""
    expect(answer).toMatch(/« signale-le »/)
    expect(answer).toMatch(/Signaler un bug/)
  })

  it("la met dans le JSON-LD FAQPage", () => {
    const { container } = render(<FaqPage />)
    const faq = [...container.querySelectorAll("script[type='application/ld+json']")]
      .map(s => JSON.parse(s.textContent || "{}"))
      .find(o => o?.["@type"] === "FAQPage")
    expect(faq).toBeDefined()
    const names: string[] = (faq?.mainEntity ?? []).map((q: { name?: string }) => q.name ?? "")
    expect(names).toContain(QUESTION)
  })
})

// Conditions Deezer (docs/CONDITIONS-API-MUSIQUE.md) : prevenir « by any
// means » que l'ecoute des extraits est reservee a un usage prive.
describe("FAQ : d'ou viennent les extraits", () => {
  const QUESTION = "D'où viennent les extraits, et peut-on les diffuser en public ?"

  it("dit que les extraits viennent de Deezer et sont reserves a une ecoute privee", () => {
    render(<FaqPage />)
    const answer = screen.getByText(QUESTION).closest("details")?.textContent ?? ""
    expect(answer).toMatch(/Deezer/)
    expect(answer).toMatch(/usage privé/)
    expect(answer).toMatch(/Spotify/)
  })
})
