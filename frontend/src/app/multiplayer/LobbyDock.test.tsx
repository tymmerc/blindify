/**
 * La bulle de chat (salle d'attente et partie) : badge des non lus, ouverture
 * au clavier, Echap qui ferme et rend le focus a la bulle.
 */
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LobbyDock } from "./LobbyDock"

const msg = (userId: number, timestamp: number, message = "salut") => ({ userId, username: `J${userId}`, message, timestamp })

const dock = (messages: ReturnType<typeof msg>[]) => (
  <LobbyDock messages={messages} onSend={vi.fn()} currentUserId={1} players={[]} accent="#e0a32e" raised title="Le chat" />
)

describe("LobbyDock", () => {
  it("ne compte pas les messages deja la ni les siens, compte ceux des autres", () => {
    const { rerender } = render(dock([msg(2, 100)]))
    expect(screen.getByRole("button", { name: "Chat" })).toBeTruthy()
    rerender(dock([msg(2, 100), msg(1, 200), msg(3, 300), msg(2, 400)]))
    expect(screen.getByRole("button", { name: "Chat, 2 messages non lus" })).toBeTruthy()
  })

  it("s'ouvre, met le focus dans le panneau, et Echap le ferme en rendant le focus a la bulle", async () => {
    const { rerender } = render(dock([]))
    rerender(dock([msg(2, 100)]))
    fireEvent.click(screen.getByRole("button", { name: "Chat, 1 message non lu" }))
    const panel = screen.getByRole("dialog", { name: "Chat" })
    expect(screen.getByText("Le chat")).toBeTruthy()
    expect(document.activeElement).toBe(panel)
    await act(async () => { fireEvent.keyDown(document, { key: "Escape" }) })
    expect(screen.queryByRole("dialog")).toBeNull()
    const bubble = screen.getByRole("button", { name: "Chat" })
    expect(document.activeElement).toBe(bubble)
  })
})
