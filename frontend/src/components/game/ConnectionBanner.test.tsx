import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConnectionBanner } from "./ConnectionBanner"

describe("ConnectionBanner", () => {
  it("garde une zone d'annonce vide quand tout va bien", () => {
    render(<ConnectionBanner status="ok" />)
    const zone = screen.getByRole("status")
    expect(zone).toHaveAttribute("aria-live", "polite")
    expect(zone).toBeEmptyDOMElement()
  })

  it("dit ce qui se passe, sans bouton pour recharger", () => {
    const { rerender } = render(<ConnectionBanner status="reconnecting" />)
    expect(screen.getByRole("status")).toHaveTextContent("Connexion perdue, on se reconnecte…")
    rerender(<ConnectionBanner status="lost" />)
    expect(screen.getByRole("status")).toHaveTextContent("Le serveur ne répond pas, on réessaie…")
    rerender(<ConnectionBanner status="back" />)
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecté")
    expect(screen.queryByRole("button")).toBeNull()
  })
})
