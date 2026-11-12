import { beforeEach, describe, expect, it, vi } from "vitest"

const clientMock = vi.hoisted(() => ({ currentUser: vi.fn(), createGuestSession: vi.fn() }))
vi.mock("./apiClient", () => ({ clientApi: clientMock }))

import { api } from "./api"

// T26 : on ne fabrique un invité neuf que si le serveur dit « personne ».
describe("ensureUserSession", () => {
  beforeEach(() => vi.clearAllMocks())

  it("garde le joueur déjà là", async () => {
    clientMock.currentUser.mockResolvedValue({ user: { id: 3 } })
    expect(await api.ensureUserSession("océ")).toEqual({ user: { id: 3 } })
    expect(clientMock.createGuestSession).not.toHaveBeenCalled()
  })

  it("crée un invité quand /me répond personne (401)", async () => {
    clientMock.currentUser.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: { id: 4 } })
    expect(await api.ensureUserSession("océ")).toEqual({ user: { id: 4 } })
    expect(clientMock.createGuestSession).toHaveBeenCalledWith("océ", undefined)
  })

  it("une coupure réseau sur /me ne crée PAS d'invité : l'appelant réessaie", async () => {
    clientMock.currentUser.mockRejectedValue(new TypeError("Load failed"))
    expect(await api.ensureUserSession("océ")).toBeNull()
    expect(clientMock.createGuestSession).not.toHaveBeenCalled()
  })
})
