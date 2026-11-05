import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ExpiredRoomView } from "./ExpiredRoomView"

const hosted = { code: "ABC123", mode: "friends" as const, hostPlays: false, questionCount: 20, roundSeconds: 15, savedAt: 1 }

describe("ExpiredRoomView", () => {
  it("l'hote voit ses reglages et peut rouvrir la salle", () => {
    const onRecreate = vi.fn()
    render(<ExpiredRoomView code="ABC123" hosted={hosted} recreating={false} onRecreate={onRecreate} />)
    expect(screen.getByText("Salle ABC123")).toBeInTheDocument()
    expect(screen.getByText(/À distance, 20 manches, 15 s pour répondre/)).toBeInTheDocument()
    fireEvent.click(screen.getByText("Rouvrir une salle pareille"))
    expect(onRecreate).toHaveBeenCalledTimes(1)
  })

  it("le bouton attend pendant l'ouverture", () => {
    render(<ExpiredRoomView code="ABC123" hosted={hosted} recreating onRecreate={vi.fn()} />)
    expect(screen.getByRole("button", { name: /Ouverture/ })).toBeDisabled()
  })

  it("un invite est renvoye vers un autre code ou sa propre partie", () => {
    render(<ExpiredRoomView code="ABC123" hosted={null} recreating={false} onRecreate={vi.fn()} />)
    expect(screen.getByText(/Demande le nouveau code/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Entrer un autre code/ })).toHaveAttribute("href", expect.stringMatching(/^\/jouer\/?$/))
    expect(screen.getByRole("link", { name: /Créer ma partie/ })).toHaveAttribute("href", "/modes")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
