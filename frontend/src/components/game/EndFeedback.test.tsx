import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EndFeedback } from "./EndFeedback"
import { clientApi } from "@/lib/apiClient"
import { buildBugPayload } from "@/lib/feedback"

vi.mock("@/lib/apiClient", () => ({
  clientApi: { sendFeedback: vi.fn() },
}))

const send = vi.mocked(clientApi.sendFeedback)

describe("EndFeedback", () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue({ received: true })
  })

  it("envoie un avis en un clic, avec le contexte de la partie", async () => {
    const user = userEvent.setup()
    render(<EndFeedback context={{ mode: "solo", sessionId: 42 }} />)

    expect(screen.getByRole("region", { name: "Ça s'est bien passé ?" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Oui" }))

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: "avis", answer: "oui", mode: "solo", sessionId: 42 }))
    expect(await screen.findByText("Merci, c'est noté.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Oui" })).toHaveAttribute("aria-pressed", "true")
    // Un seul avis par ecran de resultats.
    expect(screen.getByRole("button", { name: "Pas trop" })).toBeDisabled()
  })

  it("laisse reessayer quand l'envoi echoue", async () => {
    send.mockRejectedValueOnce(new Error("reseau"))
    const user = userEvent.setup()
    render(<EndFeedback context={{ mode: "friends", gameCode: "AB12CD" }} />)

    await user.click(screen.getByRole("button", { name: "Pas trop" }))
    expect(await screen.findByText(/n'est pas parti/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Pas trop" })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "Pas trop" }))
    expect(await screen.findByText(/Si un truc a coincé/)).toBeInTheDocument()
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "avis", answer: "pas_trop", gameCode: "AB12CD" }))
  })

  it("ouvre le formulaire de bug au clavier, focus dans le champ, Echap le referme", async () => {
    const user = userEvent.setup()
    render(<EndFeedback context={{ mode: "chrono" }} />)

    const toggle = screen.getByRole("button", { name: "Signaler un bug" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    toggle.focus()
    await user.keyboard("{Enter}")

    const field = screen.getByLabelText("Qu'est-ce qui s'est passé ?")
    expect(field).toHaveFocus()
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(field).toHaveAttribute("maxLength", "1000")

    await user.keyboard("{Escape}")
    expect(screen.queryByLabelText("Qu'est-ce qui s'est passé ?")).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
    expect(send).not.toHaveBeenCalled()
  })

  it("envoie un bug avec son texte, puis remercie", async () => {
    const user = userEvent.setup()
    render(<EndFeedback context={{ mode: "defi", gameCode: "XY7Z" }} />)

    await user.click(screen.getByRole("button", { name: "Signaler un bug" }))
    await user.type(screen.getByLabelText("Qu'est-ce qui s'est passé ?"), "  Le son a coupé  ")
    expect(screen.getByText("18/1000")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Envoyer" }))

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: "bug", message: "Le son a coupé", mode: "defi", gameCode: "XY7Z" }))
    await waitFor(() => expect(screen.getByText("Merci, on regarde ça.")).toHaveFocus())
    expect(screen.queryByRole("button", { name: "Signaler un bug" })).not.toBeInTheDocument()
  })

  it("accepte un bug sans texte (le texte est facultatif)", async () => {
    const user = userEvent.setup()
    render(<EndFeedback context={{ mode: "buzzer" }} />)

    await user.click(screen.getByRole("button", { name: "Signaler un bug" }))
    await user.click(screen.getByRole("button", { name: "Envoyer" }))
    expect(send).toHaveBeenCalledWith(expect.not.objectContaining({ message: expect.anything() }))
    expect(await screen.findByText("Merci, on regarde ça.")).toBeInTheDocument()
  })
})

describe("buildBugPayload", () => {
  it("coupe a 1000 caracteres et omet les champs vides", () => {
    const payload = buildBugPayload({ mode: "event", sessionId: null, gameCode: "" }, "a".repeat(1200))
    expect(payload.message).toHaveLength(1000)
    expect(payload).not.toHaveProperty("sessionId")
    expect(payload).not.toHaveProperty("gameCode")
  })
})
