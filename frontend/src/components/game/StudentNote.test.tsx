import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NOTE_CONTACT_LABEL, NOTE_INTRO, NOTE_THANKS, NOTE_THANKS_CONTACT, StudentNote } from "./StudentNote"
import { ApiError, clientApi } from "@/lib/apiClient"

vi.mock("@/lib/apiClient", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/apiClient")>()),
  clientApi: { sendFeedback: vi.fn() },
}))

const send = vi.mocked(clientApi.sendFeedback)

describe("StudentNote", () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue({ received: true })
  })

  it("affiche le texte de Tym mot pour mot, sans tiret cadratin, et un champ toujours ouvert", () => {
    render(<StudentNote context={{ mode: "solo" }} />)
    expect(NOTE_INTRO).toBe(
      "Hello, je suis l'étudiant derrière Blindz. Un truc qui t'a plu, un truc qui t'a saoulé ? Écris-le ici, je lis tout."
    )
    expect(screen.getByText(NOTE_INTRO)).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Ton message" })).toBeVisible()
    expect(screen.getByRole("textbox", { name: NOTE_CONTACT_LABEL })).toBeVisible()
    expect(document.body.textContent).not.toContain("\u2014")
  })

  it("garde Envoyer grise tant que le message est vide", async () => {
    const user = userEvent.setup()
    render(<StudentNote context={{ mode: "solo" }} />)
    const button = screen.getByRole("button", { name: "Envoyer" })
    expect(button).toBeDisabled()
    await user.type(screen.getByRole("textbox", { name: "Ton message" }), "   ")
    expect(button).toBeDisabled()
  })

  it("envoie un message sans contact et remercie", async () => {
    const user = userEvent.setup()
    render(<StudentNote context={{ mode: "friends", gameCode: "AB12CD" }} />)
    await user.type(screen.getByRole("textbox", { name: "Ton message" }), "  Le mode buzzer est top  ")
    await user.click(screen.getByRole("button", { name: "Envoyer" }))

    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0][0]
    expect(payload).toMatchObject({ kind: "mot", mode: "friends", gameCode: "AB12CD", message: "Le mode buzzer est top" })
    expect(payload).not.toHaveProperty("contact")
    expect(await screen.findByText(NOTE_THANKS)).toHaveFocus()
  })

  it("envoie le contact quand il est rempli, et promet une reponse", async () => {
    const user = userEvent.setup()
    render(<StudentNote context={{ mode: "site" }} />)
    await user.type(screen.getByRole("textbox", { name: "Ton message" }), "Ajoute du rap FR")
    await user.type(screen.getByRole("textbox", { name: NOTE_CONTACT_LABEL }), " @julie.bt ")
    await user.click(screen.getByRole("button", { name: "Envoyer" }))

    expect(send.mock.calls[0][0]).toMatchObject({ kind: "mot", mode: "site", message: "Ajoute du rap FR", contact: "@julie.bt" })
    expect(await screen.findByText(NOTE_THANKS_CONTACT)).toBeInTheDocument()
  })

  it("laisse reessayer apres un echec, et dit quand il y a trop d'envois", async () => {
    send.mockRejectedValueOnce(new ApiError(429, "trop"))
    const user = userEvent.setup()
    render(<StudentNote context={{ mode: "chrono" }} />)
    await user.type(screen.getByRole("textbox", { name: "Ton message" }), "coucou")
    await user.click(screen.getByRole("button", { name: "Envoyer" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/quelques minutes/)

    await user.click(screen.getByRole("button", { name: "Envoyer" }))
    expect(await screen.findByText(NOTE_THANKS)).toBeInTheDocument()
    expect(send).toHaveBeenCalledTimes(2)
  })
})
