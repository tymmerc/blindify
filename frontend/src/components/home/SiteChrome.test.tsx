import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BUG_REPORT_EVENT } from "@/components/BugReportDialog"
import { SiteFooter, SiteHeader } from "./SiteChrome"

// La mention beta (demande de Tym du 02/10) : discrete, et le pied de page
// ouvre le formulaire de signalement deja monte dans le layout.
describe("SiteChrome : mention beta", () => {
  afterEach(() => vi.restoreAllMocks())

  it("ecrit bêta en minuscules a cote du nom, sans pastille en majuscules", () => {
    render(<SiteHeader />)
    const home = screen.getByRole("link", { name: /blindz\.app/ })
    expect(home).toHaveTextContent(/blindz\.app\s*bêta/)
    const beta = screen.getByText("bêta")
    expect(beta.className).not.toMatch(/uppercase|rounded|tracking-\[/)
  })

  it("dit la beta en une phrase dans le pied de page", () => {
    render(<SiteFooter />)
    expect(screen.getByText(/blindz\.app est encore en bêta/)).toBeInTheDocument()
  })

  it("le lien du pied de page ouvre le signalement de bug", () => {
    const opened = vi.fn()
    window.addEventListener(BUG_REPORT_EVENT, opened)
    try {
      render(<SiteFooter />)
      fireEvent.click(screen.getByRole("button", { name: "signale-le" }))
    } finally {
      window.removeEventListener(BUG_REPORT_EVENT, opened)
    }
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it("n'a aucun tiret cadratin", () => {
    const { container } = render(
      <>
        <SiteHeader />
        <SiteFooter />
      </>,
    )
    expect(container.textContent).not.toContain("\u2014")
  })
})
