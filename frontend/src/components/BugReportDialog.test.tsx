import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BugReportDialog, openBugReport } from "./BugReportDialog"

vi.mock("@/lib/api", () => ({ api: { reportBug: vi.fn() } }))

// Le formulaire est ouvert depuis le pied de page par n'importe quel visiteur :
// il doit se comporter en vraie fenetre modale au clavier et au lecteur d'ecran.
function setup() {
  render(
    <>
      <button type="button" onClick={openBugReport}>
        signale-le
      </button>
      <BugReportDialog />
    </>,
  )
  const trigger = screen.getByRole("button", { name: "signale-le" })
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}

describe("BugReportDialog : fenetre modale accessible", () => {
  it("s'annonce comme un dialogue modal nomme par son titre", () => {
    setup()
    const dialog = screen.getByRole("dialog", { name: "Signaler un bug" })
    expect(dialog).toHaveAttribute("aria-modal", "true")
  })

  it("se ferme avec Echap et rend le focus au bouton qui l'a ouverte", () => {
    const trigger = setup()
    expect(document.activeElement).not.toBe(trigger)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it("rend aussi le focus quand on ferme avec le bouton Fermer", () => {
    const trigger = setup()
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it("ignore les autres touches", () => {
    setup()
    fireEvent.keyDown(document, { key: "Enter" })
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })
})
