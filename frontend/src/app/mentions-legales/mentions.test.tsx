import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import MentionsLegalesPage from "./page"

// Conditions Deezer (docs/CONDITIONS-API-MUSIQUE.md) : l'ecoute des extraits
// est reservee a un usage prive, et il faut en prevenir les joueurs.
describe("Mentions legales : extraits musicaux", () => {
  it("dit que les extraits viennent de Deezer, pour une ecoute privee", () => {
    render(<MentionsLegalesPage />)
    const section = screen.getByRole("heading", { name: "Extraits musicaux" }).parentElement?.textContent ?? ""
    expect(section).toMatch(/fournis par Deezer/)
    expect(section).toMatch(/usage privé/)
  })
})

// T17c et T17a : l'adresse de l'editeur est contact@blindz.app, et la page
// renvoie vers les conditions d'utilisation.
describe("Mentions legales : contact et conditions", () => {
  it("publie contact@blindz.app comme contact de l'editeur", () => {
    render(<MentionsLegalesPage />)
    const editeur = screen.getByRole("heading", { name: "Éditeur du site" }).parentElement
    const link = editeur?.querySelector("a[href^='mailto:']")
    expect(link).toHaveAttribute("href", "mailto:contact@blindz.app")
    expect(link).toHaveTextContent("contact@blindz.app")
  })

  it("renvoie vers les conditions d'utilisation", () => {
    render(<MentionsLegalesPage />)
    const hrefs = screen.getAllByRole("link").map(a => a.getAttribute("href"))
    expect(hrefs.filter(h => h === "/conditions/" || h === "/conditions").length).toBe(2)
  })
})
