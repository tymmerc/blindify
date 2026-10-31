import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ConfidentialitePage from "./page"

// T17c : l'adresse publiee est contact@blindz.app (redirection), plus le Gmail.
describe("Confidentialite : contact et conditions", () => {
  it("publie contact@blindz.app", () => {
    render(<ConfidentialitePage />)
    const links = screen.getAllByRole("link", { name: "contact@blindz.app" })
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) expect(a).toHaveAttribute("href", "mailto:contact@blindz.app")
  })

  it("renvoie vers les conditions d'utilisation", () => {
    render(<ConfidentialitePage />)
    expect(screen.getByRole("link", { name: "Conditions" })).toHaveAttribute("href", expect.stringMatching(/^\/conditions\/?$/))
  })
})
