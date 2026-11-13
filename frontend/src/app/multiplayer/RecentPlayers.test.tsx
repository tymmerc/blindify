// T34 (11/11) : un hote invite a appuye 6 fois sur « Inviter » dans « Rejoue avec »,
// six refus « Invitation réservée aux amis ». Personne n'a d'amis sur Blindz :
// le bouton partage maintenant le lien de la salle, comme le gros « Inviter ».
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import { inviteText } from "./lobbyKit"
import { RecentPlayers } from "./RecentPlayers"

vi.mock("@/lib/api", () => ({
  api: {
    recentPlayers: vi.fn(),
    sendInvitation: vi.fn(),
  },
}))

const LINK = "https://blindz.app/jouer/?join=ABC123"

function setPointer(coarse: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: coarse && q.includes("coarse"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
}

async function renderWithOnePlayer() {
  vi.mocked(api.recentPlayers).mockResolvedValue({ players: [{ userId: 7, username: "Joueur A", lastPlayed: "2026-11-11T14:00:00Z" }] })
  await act(async () => {
    render(<RecentPlayers roomCode="ABC123" link={LINK} accent="#d9a43a" />)
  })
}

beforeEach(() => {
  vi.mocked(api.sendInvitation).mockRejectedValue(new Error("Invitation réservée aux amis"))
})

afterEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true })
})

describe("RecentPlayers : Inviter", () => {
  it("sur telephone : ouvre la feuille de partage avec le lien, sans passer par les amis", async () => {
    setPointer(true)
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "share", { value: share, configurable: true })
    await renderWithOnePlayer()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Inviter" })) })
    expect(api.sendInvitation).not.toHaveBeenCalled()
    expect(share).toHaveBeenCalledWith({ title: "Blindz", text: inviteText("ABC123"), url: LINK })
    expect(screen.getByRole("button", { name: /Envoyé/ })).toBeInTheDocument()
    expect(screen.queryByText("Réessayer")).not.toBeInTheDocument()
  })

  it("sur ordinateur : copie le lien et le dit", async () => {
    setPointer(false)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    await renderWithOnePlayer()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Inviter" })) })
    expect(api.sendInvitation).not.toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith(LINK)
    expect(screen.getByRole("button", { name: /Lien copié/ })).toBeInTheDocument()
  })

  it("partage ferme : le bouton redevient « Inviter », sans message d'erreur", async () => {
    setPointer(true)
    Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(new DOMException("x", "AbortError")), configurable: true })
    await renderWithOnePlayer()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Inviter" })) })
    expect(screen.getByRole("button", { name: "Inviter" })).toBeInTheDocument()
    expect(screen.queryByText(/Copie impossible/)).not.toBeInTheDocument()
  })

  it("copie refusee : donne le code a recopier", async () => {
    setPointer(false)
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true })
    vi.spyOn(console, "error").mockImplementation(() => {})
    await renderWithOnePlayer()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Inviter" })) })
    expect(screen.getByText(/Copie impossible/)).toBeInTheDocument()
  })
})
