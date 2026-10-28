/**
 * Le bloc ou l'on colle un lien de playlist ou de profil (lobby, « Ta musique »
 * de l'Activite Discord). Il dit tout de suite si le lien est reconnu, n'envoie
 * qu'un lien reconnu et raconte l'import en clair.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  importPlaylists: vi.fn(),
  importSyncAll: vi.fn(),
}))
vi.mock("@/lib/api", () => ({ api: { importPlaylists: mocks.importPlaylists, importSyncAll: mocks.importSyncAll } }))

import { ProfileImportBlock } from "./ProfileImportBlock"

const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.importPlaylists.mockResolvedValue({ provider: "spotify", linkId: 7, playlists: [{ id: "p1" }, { id: "p2" }] })
  mocks.importSyncAll.mockResolvedValue({ synced: 18 })
})

const field = () => screen.getByLabelText(/lien d'une playlist ou d'un profil/i)
const importButton = () => screen.getByRole("button", { name: /^importer/i })

describe("ProfileImportBlock", () => {
  it("un champ avec un vrai libelle, en 16 px (pas de zoom iOS), clavier d'adresse", () => {
    render(<ProfileImportBlock hideHeader />)
    expect(field()).toHaveAttribute("inputmode", "url")
    expect(field().getAttribute("placeholder")).toMatch(/^https:\/\//)
    expect(field().className).toMatch(/text-base/)
  })

  it("dit tout de suite ce qu'il a reconnu, et n'active Importer qu'alors", () => {
    render(<ProfileImportBlock hideHeader />)
    expect(importButton()).toBeDisabled()
    fireEvent.change(field(), { target: { value: "https://www.deezer.com/fr/profile/5129203982" } })
    expect(screen.getByText(/profil deezer/i)).toBeInTheDocument()
    expect(importButton()).toBeEnabled()
  })

  it("lien court d'une appli : accepte, le serveur l'ouvre a l'import", async () => {
    render(<ProfileImportBlock hideHeader />)
    fireEvent.change(field(), { target: { value: "https://link.deezer.com/s/30ZnBD9L4b4a1R5V6NWDu" } })
    expect(screen.getByText(/lien court deezer/i)).toBeInTheDocument()
    expect(field()).toHaveAttribute("aria-invalid", "false")
    expect(importButton()).toBeEnabled()
    fireEvent.click(importButton())
    await waitFor(() => expect(mocks.importPlaylists).toHaveBeenCalledWith("https://link.deezer.com/s/30ZnBD9L4b4a1R5V6NWDu"))
  })

  it("lien inconnu : le dit, sans envoyer", () => {
    render(<ProfileImportBlock hideHeader />)
    fireEvent.change(field(), { target: { value: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" } })
    expect(screen.getByText(/pas un lien de playlist ni de profil/i)).toBeInTheDocument()
    expect(importButton()).toBeDisabled()
  })

  it("import : progression en clair puis le resultat, et on peut en importer un autre", async () => {
    const onImported = vi.fn()
    let release: (v: unknown) => void = () => {}
    mocks.importSyncAll.mockReturnValue(new Promise(resolve => { release = resolve }))
    render(<ProfileImportBlock hideHeader onImported={onImported} />)
    fireEvent.change(field(), { target: { value: PLAYLIST } })
    fireEvent.click(importButton())
    expect(await screen.findByRole("status")).toHaveTextContent(/import de 2 playlists/i)
    release({ synced: 18 })
    expect(await screen.findByText(/18 titres importés/i)).toBeInTheDocument()
    expect(onImported).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: /importer un autre lien/i }))
    await waitFor(() => expect(field()).toHaveValue(""))
  })

  it("aucune playlist publique : le message, le lien reste pour corriger", async () => {
    mocks.importPlaylists.mockResolvedValue({ provider: "spotify", linkId: 7, playlists: [] })
    render(<ProfileImportBlock hideHeader />)
    fireEvent.change(field(), { target: { value: PLAYLIST } })
    fireEvent.click(importButton())
    expect(await screen.findByRole("alert")).toHaveTextContent(/aucune playlist publique/i)
    expect(field()).toHaveValue(PLAYLIST)
  })

  it("« Où trouver ton lien ? » : les etapes pour Spotify et Deezer", () => {
    render(<ProfileImportBlock hideHeader />)
    fireEvent.click(screen.getByText(/où trouver ton lien/i))
    expect(screen.getAllByText(/copier le lien/i)).toHaveLength(2)
    expect(screen.getByRole("link", { name: /ouvrir spotify/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /ouvrir deezer/i })).toBeInTheDocument()
  })
})
