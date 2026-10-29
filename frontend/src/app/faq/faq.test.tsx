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

// T17b et T17a : ou signaler un bug ou proposer une idee, avec des liens
// cliquables vers le serveur, le mail et les conditions.
describe("FAQ : un bug, une idee", () => {
  const QUESTION = "Un bug, une idée\u00a0?"

  it("renvoie vers le serveur Discord, contact@blindz.app et les conditions", () => {
    render(<FaqPage />)
    // getByText ramene les espaces insecables a des espaces : on cherche le debut.
    const details = screen.getByText(/^Un bug, une idée/).closest("details") as HTMLElement
    expect(details.textContent).toMatch(/contact@blindz\.app/)
    const hrefs = [...details.querySelectorAll("a")].map(a => (a.getAttribute("href") ?? "").replace(/\/$/, ""))
    expect(hrefs).toEqual(["https://discord.gg/8pyAtVDFzU", "mailto:contact@blindz.app", "/conditions"])
  })

  it("la reponse du JSON-LD se suffit sans les liens", () => {
    const { container } = render(<FaqPage />)
    const faq = [...container.querySelectorAll("script[type='application/ld+json']")]
      .map(s => JSON.parse(s.textContent || "{}"))
      .find(o => o?.["@type"] === "FAQPage")
    const entry = (faq?.mainEntity ?? []).find((q: { name?: string }) => q.name === QUESTION)
    expect(entry?.acceptedAnswer?.text).toMatch(/discord\.gg\/8pyAtVDFzU/)
    expect(entry?.acceptedAnswer?.text).toMatch(/contact@blindz\.app/)
  })
})
