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
