import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PROFILE_URL_KEY } from "@/lib/soloSetup"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

import { SoloSelector } from "./SoloSelector"

// Lobby solo : onglets accessibles (role tab, fleches), et rien de ce que le
// joueur a saisi ne se perd quand il change d'onglet.

const LINK = "https://www.deezer.com/fr/playlist/12"

function tab(name: string) {
  return screen.getByRole("tab", { name })
}

function roundButton(value: string) {
  return within(screen.getByRole("group", { name: "Nombre de titres" })).getByRole("button", { name: value })
}

beforeEach(() => {
  push.mockReset()
  localStorage.clear()
  window.history.replaceState(null, "", "/")
})

afterEach(cleanup)

describe("SoloSelector", () => {
  it("le lien tape a la main reste un champ (pas remplace des la premiere lettre)", async () => {
    const user = userEvent.setup()
    render(<SoloSelector />)

    await user.type(screen.getByLabelText("Lien de playlist ou profil"), LINK)

    expect(screen.getByLabelText("Lien de playlist ou profil")).toHaveValue(LINK)
  })

  it("garde le lien et le nombre de titres quand on passe sur l'onglet defi", async () => {
    const user = userEvent.setup()
    render(<SoloSelector />)
    await user.type(screen.getByLabelText("Lien de playlist ou profil"), LINK)
    await user.click(roundButton("5"))

    await user.click(tab("Défier un ami"))

    expect(screen.getByLabelText("Lien de playlist ou profil")).toHaveValue(LINK)
    expect(roundButton("5")).toHaveAttribute("aria-pressed", "true")
    await user.click(screen.getByRole("button", { name: "Jouer et lancer le défi" }))
    expect(push).toHaveBeenCalledWith(`/solo?source=quickplay&quickUrl=${encodeURIComponent(LINK)}&count=5&challenge=1`)
  })

  it("« Lance un défi » ouvre l'onglet defi sans perdre le lien, focus sur son titre", async () => {
    const user = userEvent.setup()
    render(<SoloSelector />)
    await user.type(screen.getByLabelText("Lien de playlist ou profil"), LINK)

    await user.click(screen.getByRole("button", { name: "Lance un défi" }))

    expect(tab("Défier un ami")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("heading", { name: "Défier un ami" })).toHaveFocus()
    expect(screen.getByLabelText("Lien de playlist ou profil")).toHaveValue(LINK)
  })

  it("un seul bouton « Chrono » sur le classique, qui ouvre le chrono (script de campagne de main)", async () => {
    const user = userEvent.setup()
    render(<SoloSelector />)
    // browser-solo.mjs de main clique getByRole("button", { name: /^chrono$/i }) :
    // l'onglet (role tab) n'y repond plus, le lien du formulaire si, et seul.
    const buttons = screen.getAllByRole("button", { name: /^chrono$/i })
    expect(buttons).toHaveLength(1)

    await user.click(buttons[0])

    expect(tab("Chrono")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("heading", { name: "Chrono" })).toHaveFocus()
    expect(screen.getByRole("button", { name: /lancer le chrono/i })).toBeInTheDocument()
  })

  it("onglets au clavier : fleches, un seul onglet dans l'ordre de tabulation, panneau relie", async () => {
    const user = userEvent.setup()
    render(<SoloSelector />)
    expect(tab("Classique")).toHaveAttribute("tabindex", "0")
    expect(tab("Chrono")).toHaveAttribute("tabindex", "-1")

    tab("Classique").focus()
    await user.keyboard("{ArrowRight}")

    expect(tab("Chrono")).toHaveFocus()
    expect(tab("Chrono")).toHaveAttribute("aria-selected", "true")
    expect(tab("Chrono")).toHaveAttribute("tabindex", "0")
    expect(tab("Classique")).toHaveAttribute("aria-selected", "false")
    expect(screen.getByRole("tabpanel", { name: "Chrono" })).toBeInTheDocument()

    await user.keyboard("{End}")
    expect(tab("Défier un ami")).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(tab("Classique")).toHaveFocus()
  })

  it("l'onglet ouvert est tenu dans l'adresse (?tab=), et lu au chargement", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/?tab=challenge")
    render(<SoloSelector />)
    expect(tab("Défier un ami")).toHaveAttribute("aria-selected", "true")

    await user.click(tab("Chrono"))
    expect(window.location.search).toBe("?tab=chrono")
    await user.click(tab("Classique"))
    expect(window.location.search).toBe("")
  })

  it("lien deja connu (/jouer) : confirmation, puis champ pre-rempli sur Changer, partout", async () => {
    const user = userEvent.setup()
    localStorage.setItem(PROFILE_URL_KEY, LINK)
    render(<SoloSelector />)

    expect(await screen.findByText(/Ta musique : Deezer/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Changer" }))
    await user.click(tab("Chrono"))

    expect(screen.getByLabelText("Lien de playlist ou profil")).toHaveValue(LINK)
  })
})
