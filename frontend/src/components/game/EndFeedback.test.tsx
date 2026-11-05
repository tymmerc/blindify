import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EndFeedback } from "./EndFeedback"
import { ApiError, clientApi } from "@/lib/apiClient"
import { buildAnswerPayload, buildBugPayload } from "@/lib/feedback"
import { GAMES_KEY, PROMPT_SHOWN_KEY, resetPromptMemory } from "@/lib/feedbackPrompt"
import { NOTE_INTRO } from "./StudentNote"

vi.mock("@/lib/apiClient", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/apiClient")>()),
  clientApi: { sendFeedback: vi.fn() },
}))

/** Envoi qui reste en vol jusqu'a ce que le test le termine. */
function pendingSend() {
  let finish = () => {}
  send.mockImplementation(() => new Promise(resolve => {
    finish = () => resolve({ received: true })
  }))
  return () => finish()
}

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
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: "avis", answer: "oui", mode: "solo", sessionId: 42 }), expect.any(AbortSignal))
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
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "avis", answer: "pas_trop", gameCode: "AB12CD" }), expect.any(AbortSignal))
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

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: "bug", message: "Le son a coupé", mode: "defi", gameCode: "XY7Z" }), expect.any(AbortSignal))
    await waitFor(() => expect(screen.getByText("Merci, on regarde ça.")).toHaveFocus())
    expect(screen.queryByRole("button", { name: "Signaler un bug" })).not.toBeInTheDocument()
  })

  it("deux clics dans le meme instant n'envoient qu'un avis", async () => {
    const finish = pendingSend()
    render(<EndFeedback context={{ mode: "solo", sessionId: 7 }} />)
    const oui = screen.getByRole("button", { name: "Oui" })
    const pasTrop = screen.getByRole("button", { name: "Pas trop" })

    // Dans un meme act, React n'a pas encore redessine les boutons entre les clics.
    act(() => {
      oui.click()
      pasTrop.click()
      oui.click()
    })
    expect(send).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    expect(await screen.findByText("Merci, c'est noté.")).toBeInTheDocument()
  })

  it("un double Envoyer ne fait qu'un signalement", async () => {
    const user = userEvent.setup()
    render(<EndFeedback context={{ mode: "chrono" }} />)
    await user.click(screen.getByRole("button", { name: "Signaler un bug" }))
    const finish = pendingSend()
    const envoyer = screen.getByRole("button", { name: "Envoyer" })

    act(() => {
      envoyer.click()
      envoyer.click()
    })
    expect(send).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    expect(await screen.findByText("Merci, on regarde ça.")).toBeInTheDocument()
  })

  it("dit clairement quand il y a eu trop d'envois (429), et laisse reessayer", async () => {
    send.mockRejectedValueOnce(new ApiError(429, "Trop de retours d'un coup.", "rate_limited"))
    const user = userEvent.setup()
    render(<EndFeedback context={{ mode: "event", gameCode: "EV3NT1" }} />)

    await user.click(screen.getByRole("button", { name: "Oui" }))
    expect(await screen.findByText(/Beaucoup d'envois d'un coup/)).toBeInTheDocument()
    expect(screen.queryByText(/n'est pas parti/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Oui" })).toBeEnabled()

    send.mockRejectedValueOnce(new ApiError(429, "Trop de retours d'un coup.", "rate_limited"))
    await user.click(screen.getByRole("button", { name: "Signaler un bug" }))
    await user.type(screen.getByLabelText("Qu'est-ce qui s'est passé ?"), "Le score a sauté")
    await user.click(screen.getByRole("button", { name: "Envoyer" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/Beaucoup d'envois d'un coup/)
    // Le texte tape n'est pas perdu.
    expect(screen.getByLabelText("Qu'est-ce qui s'est passé ?")).toHaveValue("Le score a sauté")
  })

  it("accepte un bug sans texte (le texte est facultatif)", async () => {
    const user = userEvent.setup()
    render(<EndFeedback context={{ mode: "buzzer" }} />)

    await user.click(screen.getByRole("button", { name: "Signaler un bug" }))
    await user.click(screen.getByRole("button", { name: "Envoyer" }))
    expect(send).toHaveBeenCalledWith(expect.not.objectContaining({ message: expect.anything() }), expect.any(AbortSignal))
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

describe("buildAnswerPayload", () => {
  it("n'envoie pas l'identifiant 0 du solo lance par un lien (aucune partie en base)", () => {
    const payload = buildAnswerPayload({ mode: "solo", sessionId: 0 }, "pas_trop")
    expect(payload).toMatchObject({ kind: "avis", answer: "pas_trop", mode: "solo" })
    expect(payload).not.toHaveProperty("sessionId")
  })
})

describe("EndFeedback : le message de Tym en fin de 2e partie (T24)", () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue({ received: true })
    localStorage.removeItem(PROMPT_SHOWN_KEY)
    localStorage.removeItem(GAMES_KEY)
    resetPromptMemory()
  })

  it("garde le Oui / Pas trop a la 1re partie, montre le message a la 2e, puis plus jamais", () => {
    const first = render(<EndFeedback context={{ mode: "solo" }} />)
    expect(screen.getByRole("button", { name: "Oui" })).toBeInTheDocument()
    expect(screen.queryByText(NOTE_INTRO)).not.toBeInTheDocument()
    first.unmount()

    const second = render(<EndFeedback context={{ mode: "buzzer" }} />)
    expect(screen.getByText(NOTE_INTRO)).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Ton message" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Oui" })).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Un mot pour l'étudiant derrière Blindz" })).toBeInTheDocument()
    second.unmount()

    render(<EndFeedback context={{ mode: "chrono" }} />)
    expect(screen.queryByText(NOTE_INTRO)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Oui" })).toBeInTheDocument()
  })

  it("ne compte qu'une partie par ecran, meme si l'ecran se redessine", () => {
    const view = render(<EndFeedback context={{ mode: "solo" }} />)
    view.rerender(<EndFeedback context={{ mode: "solo" }} />)
    view.rerender(<EndFeedback context={{ mode: "solo" }} />)
    expect(localStorage.getItem(GAMES_KEY)).toBe("1")
    expect(screen.queryByText(NOTE_INTRO)).not.toBeInTheDocument()
  })

  it("sans stockage, montre quand meme le message a la 2e partie de la session", () => {
    const spy = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("SecurityError")
    })
    try {
      render(<EndFeedback context={{ mode: "friends", gameCode: "AB12CD" }} />).unmount()
      render(<EndFeedback context={{ mode: "chrono" }} />)
      expect(screen.getByText(NOTE_INTRO)).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  it("un ecran de fin demonte puis remonte pour la meme partie ne compte qu'une fois (solo, vu sur la pile)", () => {
    // Derniere manche du solo : l'ecran de fin apparait 120 ms, disparait sous
    // la fenetre du resultat, puis revient apres « Terminer ».
    render(<EndFeedback context={{ mode: "solo", sessionId: 31 }} />).unmount()
    render(<EndFeedback context={{ mode: "solo", sessionId: 31 }} />)
    expect(localStorage.getItem(GAMES_KEY)).toBe("1")
    expect(screen.queryByText(NOTE_INTRO)).not.toBeInTheDocument()
  })

  it("garde le message affiche si l'ecran de la 2e partie est remonte", () => {
    render(<EndFeedback context={{ mode: "solo", sessionId: 1 }} />).unmount()
    render(<EndFeedback context={{ mode: "solo", sessionId: 2 }} />).unmount()
    render(<EndFeedback context={{ mode: "solo", sessionId: 2 }} />)
    expect(screen.getByText(NOTE_INTRO)).toBeInTheDocument()
    expect(localStorage.getItem(GAMES_KEY)).toBe("2")
  })

  it("dans la meme salle, la partie suivante compte bien (apres la fenetre de remontage)", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    try {
      render(<EndFeedback context={{ mode: "friends", gameCode: "AB12CD" }} />).unmount()
      now.mockReturnValue(1_000_000 + 4 * 60_000)
      render(<EndFeedback context={{ mode: "friends", gameCode: "AB12CD" }} />)
      expect(screen.getByText(NOTE_INTRO)).toBeInTheDocument()
    } finally {
      now.mockRestore()
    }
  })

  it("le message part avec le contexte de la partie", async () => {
    localStorage.setItem(GAMES_KEY, "1")
    const user = userEvent.setup()
    render(<EndFeedback context={{ mode: "solo", sessionId: 7 }} />)
    await user.type(screen.getByRole("textbox", { name: "Ton message" }), "génial")
    await user.click(screen.getByRole("button", { name: "Envoyer" }))
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "mot", mode: "solo", sessionId: 7, message: "génial" }),
      expect.any(AbortSignal)
    )
  })
})
