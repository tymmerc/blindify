import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import sitemap from "@/app/sitemap"
import ConditionsPage, { metadata } from "./page"

// T17a : Discord demande une page publique de conditions d'utilisation. On
// verifie qu'elle couvre la liste de docs/DISCORD-DISCOVERY.md et qu'on peut
// joindre Blindz depuis la page.
const sectionText = (title: string) =>
  screen.getByRole("heading", { name: title }).parentElement?.textContent ?? ""

describe("Page /conditions/", () => {
  it("a son URL canonique et figure dans le sitemap", () => {
    expect(metadata.alternates?.canonical).toBe("https://blindz.app/conditions/")
    expect(sitemap().map(e => e.url)).toContain("https://blindz.app/conditions/")
  })

  it("couvre chaque point de la liste T17a", () => {
    render(<ConditionsPage />)
    expect(sectionText("Le service")).toMatch(/gratuit/)
    expect(sectionText("La musique, en écoute privée")).toMatch(/fournis par Deezer/)
    expect(sectionText("La musique, en écoute privée")).toMatch(/usage privé/)
    expect(sectionText("Ton comportement")).toMatch(/pseudo/)
    expect(sectionText("L'âge pour jouer")).toMatch(/15 ans/)
    expect(sectionText("Ton compte Discord")).toMatch(/Applications autorisées/)
    expect(sectionText("Les marques")).toMatch(/Spotify, Deezer et Discord/)
    expect(sectionText("Changements et droit applicable")).toMatch(/droit français/)
  })

  it("donne l'adresse de contact et le serveur Discord, a cote l'un de l'autre", () => {
    render(<ConditionsPage />)
    const contact = within(screen.getByRole("heading", { name: "Contact" }).parentElement as HTMLElement)
    expect(contact.getByRole("link", { name: "contact@blindz.app" })).toHaveAttribute("href", "mailto:contact@blindz.app")
    const discord = contact.getByRole("link", { name: /serveur Discord de Blindz/ })
    expect(discord).toHaveAttribute("href", "https://discord.gg/8pyAtVDFzU")
    expect(discord).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("renvoie vers les mentions legales et la confidentialite", () => {
    render(<ConditionsPage />)
    // next/link retire la barre finale dans les tests : on accepte les deux.
    const hrefs = screen.getAllByRole("link").map(a => (a.getAttribute("href") ?? "").replace(/\/$/, ""))
    expect(hrefs).toContain("/mentions-legales")
    expect(hrefs).toContain("/confidentialite")
  })

  it("n'a aucun tiret cadratin", () => {
    const { container } = render(<ConditionsPage />)
    expect(container.textContent).not.toContain("—")
  })
})
