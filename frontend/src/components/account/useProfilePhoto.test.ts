import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const uploadPhoto = vi.fn()
const deletePhoto = vi.fn()
vi.mock("@/lib/api", () => ({ api: { uploadPhoto: (b: Blob) => uploadPhoto(b), deletePhoto: () => deletePhoto() } }))
vi.mock("@/lib/photo", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/photo")>()),
  shrinkPhoto: async () => new Blob(["x"], { type: "image/jpeg" }),
}))

import { useProfilePhoto } from "./useProfilePhoto"

const file = () => new File(["x"], "a.jpg", { type: "image/jpeg" })

beforeEach(() => {
  uploadPhoto.mockReset()
  deletePhoto.mockReset()
  URL.createObjectURL = vi.fn(() => "blob:apercu")
  URL.revokeObjectURL = vi.fn()
})

describe("useProfilePhoto", () => {
  it("Mon compte : un envoi rate remet la photo en ligne, pas l'apercu", async () => {
    uploadPhoto.mockRejectedValue(new Error("reseau"))
    const { result } = renderHook(() => useProfilePhoto())
    act(() => result.current.setOnline("/api/photos/ancienne.webp"))
    await act(() => result.current.pick(file(), true))
    expect(result.current.src).toMatch(/\/api\/photos\/ancienne\.webp$/)
    expect(result.current.hasPending).toBe(false)
    expect(result.current.error).toBeTruthy()
  })

  it("ecran du debut : la photo attend, un echec la garde pour un nouvel essai", async () => {
    const { result } = renderHook(() => useProfilePhoto())
    await act(() => result.current.pick(file(), false))
    expect(result.current.src).toBe("blob:apercu")
    expect(uploadPhoto).not.toHaveBeenCalled()

    uploadPhoto.mockRejectedValueOnce(new Error("reseau"))
    let sent = true
    await act(async () => { sent = await result.current.sendPending() })
    expect(sent).toBe(false)
    expect(result.current.hasPending).toBe(true)

    uploadPhoto.mockResolvedValueOnce({ avatar: "/api/photos/nouvelle.webp" })
    await act(async () => { sent = await result.current.sendPending() })
    expect(sent).toBe(true)
    expect(result.current.hasPending).toBe(false)
    expect(result.current.src).toMatch(/\/api\/photos\/nouvelle\.webp$/)
  })

  it("retirer : sans photo en ligne, rien n'est envoye au serveur", async () => {
    const { result } = renderHook(() => useProfilePhoto())
    await act(() => result.current.pick(file(), false))
    await act(() => result.current.remove())
    expect(deletePhoto).not.toHaveBeenCalled()
    expect(result.current.src).toBeNull()
  })
})
