/**
 * « Jouer sur Discord » : le bouton et la ligne discrete menent au lien
 * d'installation de l'Activite, dans un nouvel onglet, avec les 3 etapes.
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DiscordHint, DiscordPlay } from "./DiscordPlay"
import { DISCORD_APP_ID, DISCORD_INSTALL_URL, DISCORD_STEPS } from "@/lib/discord/install"

const EXPECTED = "https://discord.com/oauth2/authorize?client_id=1559906854111420416"

describe("lien d'installation Discord", () => {
  it("un seul identifiant, celui de l'appli Blindz", () => {
    expect(DISCORD_APP_ID).toBe("1559906854111420416")
    expect(DISCORD_INSTALL_URL).toBe(EXPECTED)
  })
})

describe("DiscordPlay", () => {
  it("le bouton ouvre l'installation dans un nouvel onglet", () => {
    render(<DiscordPlay />)
    const link = screen.getByRole("link", { name: /jouer sur discord/i })
    expect(link).toHaveAttribute("href", EXPECTED)
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("montre les 3 etapes et la note pour les potes", () => {
    render(<DiscordPlay tone="dark" />)
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
    for (const step of DISCORD_STEPS) expect(screen.getByText(step)).toBeInTheDocument()
    expect(screen.getByText(/sans rien installer/i)).toBeInTheDocument()
  })

  it("sous le bouton, un lien discret vers le serveur Blindz (T17b)", () => {
    render(<DiscordPlay />)
    const link = screen.getByRole("link", { name: /le serveur blindz/i })
    expect(link).toHaveAttribute("href", "https://discord.gg/8pyAtVDFzU")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("heading=false : sans en-tete, le bouton reste", () => {
    render(<DiscordPlay heading={false} />)
    expect(screen.queryByText(/en appel sur discord/i)).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /jouer sur discord/i })).toHaveAttribute("href", EXPECTED)
  })
})

describe("DiscordHint", () => {
  it("une ligne discrete vers le meme lien, les etapes repliees", () => {
    const { container } = render(<DiscordHint />)
    expect(screen.getByText(/vous êtes en appel discord/i)).toBeInTheDocument()
    const link = screen.getByRole("link", { name: /jouez directement dans l'appel/i })
    expect(link).toHaveAttribute("href", EXPECTED)
    expect(link).toHaveAttribute("target", "_blank")
    const details = container.querySelector("details")
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute("open")
    expect(details?.querySelectorAll("li")).toHaveLength(3)
  })
})
