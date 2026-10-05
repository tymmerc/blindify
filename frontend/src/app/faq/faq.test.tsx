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
