/**
 * L'ecran /import (depuis le compte). T37 : ses titres arrivaient sans carte
 * et tombaient dans « Imports precedents » : retirer la carte du lien ne les
 * retirait donc pas. Ils vont maintenant sur la carte du lien.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  importPlaylists: vi.fn(),
  importSyncAll: vi.fn(),
  importSync: vi.fn(),
}))
vi.mock("@/lib/api", () => ({ api: mocks }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import ImportPage from "./page"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.importPlaylists.mockResolvedValue({
    provider: "deezer", type: "playlist", linkId: 42, notice: "",
    playlists: [{ id: "908622995", name: "Playlist", trackCount: 120, cover: null }],
  })
  mocks.importSyncAll.mockResolvedValue({ synced: 120, total: 120, failed: 0 })
  mocks.importSync.mockResolvedValue({ synced: 120, failed: 0 })
})

async function search() {
  render(<ImportPage />)
  fireEvent.change(screen.getByPlaceholderText(/open\.spotify\.com\/user/), { target: { value: "https://www.deezer.com/fr/playlist/908622995" } })
  fireEvent.click(screen.getByRole("button", { name: "Chercher" }))
  await screen.findByRole("button", { name: "Tout importer" })
}

describe("/import", () => {
  it("Tout importer : les titres vont sur la carte du lien", async () => {
    await search()
    fireEvent.click(screen.getByRole("button", { name: "Tout importer" }))
    await waitFor(() => expect(mocks.importSyncAll).toHaveBeenCalledWith("deezer", ["908622995"], undefined, 42))
  })

  it("une playlist seule : sur la carte du lien aussi", async () => {
    await search()
    fireEvent.click(screen.getByRole("button", { name: "Importer cette playlist" }))
    await waitFor(() => expect(mocks.importSync).toHaveBeenCalledWith("deezer", "908622995", 42))
  })

  it("le message du serveur passe tel quel", async () => {
    mocks.importPlaylists.mockRejectedValue(new Error("Spotify ne répond pas en ce moment. Réessaie dans une minute, ou colle le lien Deezer de la même playlist."))
    render(<ImportPage />)
    fireEvent.change(screen.getByPlaceholderText(/open\.spotify\.com\/user/), { target: { value: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" } })
    fireEvent.click(screen.getByRole("button", { name: "Chercher" }))
    expect(await screen.findByText(/Spotify ne répond pas en ce moment/)).toBeInTheDocument()
  })
})
