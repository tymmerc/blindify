// Le petit menu de l'Activite : supprimer son compte (decision de Tym du
// 10/10/2026, pour tenir la promesse de la page Confidentialite aussi dans
// Discord). Confirmation explicite, jamais window.confirm (bloque dans l'iframe).
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  setApiBearerToken: vi.fn(),
  disconnectSocket: vi.fn(),
}))
vi.mock("@/lib/api", () => ({ api: { deleteAccount: mocks.deleteAccount } }))
vi.mock("@/lib/apiClient", () => ({ setApiBearerToken: mocks.setApiBearerToken }))
vi.mock("@/lib/socket", () => ({ disconnectSocket: mocks.disconnectSocket }))

import { DiscordMenu } from "./DiscordMenu"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteAccount.mockResolvedValue(undefined)
})

describe("DiscordMenu", () => {
  it("ferme par defaut ; le bouton ouvre le panneau, qui dit ce qu'on garde", () => {
    render(<DiscordMenu onDeleted={vi.fn()} />)
    expect(screen.queryByText(/supprimer mon compte/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /réglages/i }))
    expect(screen.getByText(/identifiant Discord/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /supprimer mon compte/i })).toBeInTheDocument()
  })

  it("demande une confirmation explicite ; Annuler ne supprime rien", () => {
    render(<DiscordMenu onDeleted={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /réglages/i }))
    fireEvent.click(screen.getByRole("button", { name: /supprimer mon compte/i }))
    expect(screen.getByText(/définitif/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /annuler/i }))
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
    expect(screen.queryByText(/définitif/i)).not.toBeInTheDocument()
  })

  it("confirmer supprime le compte, retire la session et le socket, puis previent la page", async () => {
    const onDeleted = vi.fn()
    render(<DiscordMenu onDeleted={onDeleted} />)
    fireEvent.click(screen.getByRole("button", { name: /réglages/i }))
    fireEvent.click(screen.getByRole("button", { name: /supprimer mon compte/i }))
    fireEvent.click(screen.getByRole("button", { name: /oui, supprimer/i }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(mocks.deleteAccount).toHaveBeenCalledTimes(1)
    expect(mocks.setApiBearerToken).toHaveBeenCalledWith(null)
    expect(mocks.disconnectSocket).toHaveBeenCalledTimes(1)
  })

  it("si la suppression echoue : message, et le compte reste", async () => {
    mocks.deleteAccount.mockRejectedValue(new Error("500"))
    const onDeleted = vi.fn()
    render(<DiscordMenu onDeleted={onDeleted} />)
    fireEvent.click(screen.getByRole("button", { name: /réglages/i }))
    fireEvent.click(screen.getByRole("button", { name: /supprimer mon compte/i }))
    fireEvent.click(screen.getByRole("button", { name: /oui, supprimer/i }))

    expect(await screen.findByText(/n'a pas abouti/i)).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(mocks.setApiBearerToken).not.toHaveBeenCalled()
  })
})
