/**
 * La bibliotheque du joueur. T37 (decision de Tym du 13/11) : une seule
 * playlist par joueur et par partie. Choisir une carte decoche les autres.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getLinks: vi.fn(),
  toggleLink: vi.fn(),
  deleteLink: vi.fn(),
  linkDetails: vi.fn(),
}))
vi.mock("@/lib/api", () => ({ api: mocks }))

import { MusicLibrary } from "./MusicLibrary"

const card = (id: number, label: string, active: boolean, tracks: number) => ({
  id, url: `https://www.deezer.com/playlist/${id}`, provider: "deezer", kind: "playlist", label, image_url: null,
  active, times_played: 0, last_import_at: "2026-11-13T09:00:00Z", track_count: String(tracks),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getLinks.mockResolvedValue({ links: [card(1, "Soirée", true, 40), card(2, "Années 80", false, 25)] })
  mocks.toggleLink.mockResolvedValue({ id: 2, active: true })
})

describe("MusicLibrary : une playlist par joueur", () => {
  it("un choix unique (boutons radio), une seule carte choisie", async () => {
    render(<MusicLibrary accent="#c65133" />)
    const radios = await screen.findAllByRole("radio")
    expect(radios).toHaveLength(2)
    expect(radios.filter(r => (r as HTMLInputElement).checked)).toHaveLength(1)
    expect(screen.getByText(/Ce soir : 40 titres en jeu/)).toBeInTheDocument()
  })

  it("choisir une autre carte decoche la premiere et le dit au serveur", async () => {
    render(<MusicLibrary accent="#c65133" />)
    fireEvent.click(await screen.findByRole("radio", { name: /Années 80/ }))
    await waitFor(() => expect(mocks.toggleLink).toHaveBeenCalledWith(2, true))
    expect(screen.getByRole("radio", { name: /Soirée/ })).not.toBeChecked()
    expect(screen.getByRole("radio", { name: /Années 80/ })).toBeChecked()
    expect(screen.getByText(/Ce soir : 25 titres en jeu/)).toBeInTheDocument()
  })

  it("le serveur refuse : le choix d'avant revient", async () => {
    mocks.toggleLink.mockRejectedValue(new Error("reseau"))
    render(<MusicLibrary accent="#c65133" />)
    fireEvent.click(await screen.findByRole("radio", { name: /Années 80/ }))
    await waitFor(() => expect(screen.getByRole("radio", { name: /Soirée/ })).toBeChecked())
  })
})
