// T7 (01/11) : le lien d'invitation n'a pas servi, une amie est entree par
// l'adresse de la page de l'hote. « Inviter » partage le vrai lien.
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ShareButtons, inviteText } from "./lobbyKit"

const LINK = "https://blindz.app/jouer/?join=ABC123"

function setPointer(coarse: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: coarse && q.includes("coarse"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true })
})

describe("ShareButtons : Inviter", () => {
  it("sur telephone : la feuille de partage native, avec le lien et le code", async () => {
    setPointer(true)
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "share", { value: share, configurable: true })
    render(<ShareButtons code="ABC123" link={LINK} />)
    await act(async () => { fireEvent.click(screen.getByTestId("lobby-inviter")) })
    expect(share).toHaveBeenCalledWith({ title: "Blindz", text: inviteText("ABC123"), url: LINK })
    expect(inviteText("ABC123")).toContain("ABC123")
  })

  it("sur ordinateur : copie le lien, et le dit seulement si la copie a marche", async () => {
    setPointer(false)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(<ShareButtons code="ABC123" link={LINK} />)
    await act(async () => { fireEvent.click(screen.getByTestId("lobby-inviter")) })
    expect(writeText).toHaveBeenCalledWith(LINK)
    expect(screen.getByText("Lien copié")).toBeInTheDocument()
  })

  it("partage ferme par le joueur : ni copie ni message", async () => {
    setPointer(true)
    Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(new DOMException("x", "AbortError")), configurable: true })
    const writeText = vi.fn()
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(<ShareButtons code="ABC123" link={LINK} />)
    await act(async () => { fireEvent.click(screen.getByTestId("lobby-inviter")) })
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByText(/Copie impossible/)).not.toBeInTheDocument()
  })

  it("copie refusee : on dit de recopier le code", async () => {
    setPointer(false)
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true })
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<ShareButtons code="ABC123" link={LINK} />)
    await act(async () => { fireEvent.click(screen.getByTestId("lobby-inviter")) })
    expect(screen.getByText(/Copie impossible/)).toBeInTheDocument()
  })
})
