import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GameHistoryEntry } from "@/lib/types"

const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}))

const apiMock = vi.hoisted(() => ({
  checkAuth: vi.fn(),
  ensureUserSession: vi.fn(),
  gameHistoryDetailed: vi.fn(),
  detailedStats: vi.fn(),
  logout: vi.fn(),
  deleteAccount: vi.fn(),
  register: vi.fn(),
}))
vi.mock("@/lib/api", () => ({ api: apiMock }))
vi.mock("@/components/import/MusicLibrary", () => ({ MusicLibrary: () => <p>Bibliothèque</p> }))

import { AccountScreen } from "./AccountScreen"
import { NICKNAME_KEY } from "@/lib/soloSetup"

const guest = { user: { id: 7, username: "Guest-ab12cd", provider: "guest", email: null, avatar: null } }
const local = { user: { id: 8, username: "Léa", provider: "local", email: null, avatar: null } }

const games: GameHistoryEntry[] = [
  {
    id: 1, mode: "solo", difficulty: "normal", state: "finished", totalRounds: 10, createdAt: "2026-11-01T20:00:00Z",
    score: 0, correct: 0, bestStreak: 0, tracks: [{ title: "Respire", artist: "Mickey 3D", album_cover: null }],
  },
  {
    id: 2, mode: "event", difficulty: "normal", state: "finished", totalRounds: 12, createdAt: "2026-11-01T21:00:00Z",
    score: 7, correct: 7, bestStreak: 3, tracks: [],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.removeItem(NICKNAME_KEY)
  apiMock.gameHistoryDetailed.mockResolvedValue({ games })
  apiMock.detailedStats.mockResolvedValue({ stats: { totalGames: 2, accuracyRate: 63.6, bestStreak: 3 } })
})

describe("écran Mon compte", () => {
  it("montre à un invité ses vraies parties, sans badge, niveau ni « Créer un compte »", async () => {
    apiMock.checkAuth.mockResolvedValue(guest)
    render(<AccountScreen />)

    expect(await screen.findByText("Autour d'une table")).toBeInTheDocument()
    expect(screen.getByText("7 sur 12 morceaux")).toBeInTheDocument()
    // solo : plus de faux « 0 pts », seulement le nombre de morceaux
    expect(screen.getByText("10 morceaux")).toBeInTheDocument()
    expect(screen.getByText("2 parties · 64 % de bonnes réponses · meilleure série : 3")).toBeInTheDocument()

    const text = document.body.textContent ?? ""
    for (const gone of ["Achievements", "Recent runs", "Niveau", "XP", "Créer un compte", "Guest-ab12cd", "pts"]) {
      expect(text).not.toContain(gone)
    }
    expect(screen.getByRole("button", { name: "Effacer mes données" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Se déconnecter" })).toBeNull()
  })

  it("ouvre les titres d'une partie finie au toucher", async () => {
    apiMock.checkAuth.mockResolvedValue(guest)
    render(<AccountScreen />)
    fireEvent.click(await screen.findByRole("button", { name: /Solo/ }))
    expect(screen.getByText("Respire")).toBeInTheDocument()
  })

  it("ne crée pas d'invité pour un visiteur sans session", async () => {
    apiMock.checkAuth.mockResolvedValue(null)
    render(<AccountScreen />)
    expect(await screen.findByText("Pas encore de partie ici.", { exact: false })).toBeInTheDocument()
    expect(apiMock.ensureUserSession).not.toHaveBeenCalled()
    expect(apiMock.gameHistoryDetailed).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: /Effacer|Supprimer/ })).toBeNull()
  })

  it("garde le pseudo choisi dans ce navigateur", async () => {
    apiMock.checkAuth.mockResolvedValue(guest)
    render(<AccountScreen />)
    const field = await screen.findByLabelText("Ton pseudo")
    expect(field).toHaveValue("")

    fireEvent.change(field, { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Au moins 2 caractères.")
    expect(localStorage.getItem(NICKNAME_KEY)).toBeNull()

    fireEvent.change(field, { target: { value: "  Le  roi " } })
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    expect(localStorage.getItem(NICKNAME_KEY)).toBe("Le roi")
    expect(screen.getByRole("button", { name: "Enregistré" })).toBeDisabled()
  })

  it("propose la déconnexion et la suppression à un compte", async () => {
    apiMock.checkAuth.mockResolvedValue(local)
    vi.spyOn(window, "confirm").mockReturnValue(true)
    apiMock.deleteAccount.mockResolvedValue(undefined)
    localStorage.setItem(NICKNAME_KEY, "Léa")
    render(<AccountScreen />)

    expect(await screen.findByText("Léa", { selector: "strong" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Supprimer mon compte" }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"))
    expect(apiMock.deleteAccount).toHaveBeenCalled()
    expect(localStorage.getItem(NICKNAME_KEY)).toBeNull()
  })

  it("le dit quand les parties ne se chargent pas", async () => {
    apiMock.checkAuth.mockResolvedValue(guest)
    apiMock.gameHistoryDetailed.mockRejectedValue(new Error("500"))
    render(<AccountScreen />)
    expect(await screen.findByText("Impossible de charger tes parties pour l'instant.")).toBeInTheDocument()
  })
})

// T26 : un invité garde ses infos en choisissant un mot de passe.
describe("Garder mes infos", () => {
  it("propose à un invité de garder ses infos, puis le montre connecté sous le même pseudo", async () => {
    localStorage.setItem(NICKNAME_KEY, "océ")
    apiMock.checkAuth.mockResolvedValue({ user: { ...guest.user, username: "océ" } })
    apiMock.register.mockResolvedValue({ user: { ...guest.user, username: "océ", provider: "local" }, sessionToken: "t" })
    render(<AccountScreen />)

    const pseudo = await screen.findByPlaceholderText("Pseudo pour te connecter")
    expect(pseudo).toHaveValue("océ")
    fireEvent.change(screen.getByPlaceholderText(/Mot de passe/), { target: { value: "motdepasse" } })
    fireEvent.click(screen.getByRole("button", { name: "Garder mes infos" }))

    await waitFor(() => expect(apiMock.register).toHaveBeenCalledWith("océ", "motdepasse"))
    expect(await screen.findByText("Connecté en tant que", { exact: false })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Garder mes infos" })).toBeNull()
  })

  it("refuse un mot de passe trop court sans appeler le serveur", async () => {
    localStorage.setItem(NICKNAME_KEY, "Fannou")
    apiMock.checkAuth.mockResolvedValue(guest)
    render(<AccountScreen />)
    fireEvent.change(await screen.findByPlaceholderText(/Mot de passe/), { target: { value: "court" } })
    fireEvent.click(screen.getByRole("button", { name: "Garder mes infos" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("au moins 8 caractères")
    expect(apiMock.register).not.toHaveBeenCalled()
  })

  it("explique un pseudo déjà pris", async () => {
    const { ApiError } = await import("@/lib/apiClient")
    localStorage.setItem(NICKNAME_KEY, "Miguel")
    apiMock.checkAuth.mockResolvedValue(guest)
    apiMock.register.mockRejectedValue(new ApiError(409, "pris", "username_taken"))
    render(<AccountScreen />)
    fireEvent.change(await screen.findByPlaceholderText(/Mot de passe/), { target: { value: "motdepasse" } })
    fireEvent.click(screen.getByRole("button", { name: "Garder mes infos" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("déjà pris")
  })

  it("n'apparaît ni pour un compte ni pour un visiteur sans session", async () => {
    apiMock.checkAuth.mockResolvedValue(local)
    const { unmount } = render(<AccountScreen />)
    expect(await screen.findByText("Connecté en tant que", { exact: false })).toBeInTheDocument()
    expect(screen.queryByText("Garder mes infos")).toBeNull()
    unmount()

    apiMock.checkAuth.mockResolvedValue(null)
    render(<AccountScreen />)
    expect(await screen.findByText("Pas encore de partie ici.", { exact: false })).toBeInTheDocument()
    expect(screen.queryByText("Garder mes infos")).toBeNull()
  })
})
