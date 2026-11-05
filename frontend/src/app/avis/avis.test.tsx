import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import AvisPage, { metadata } from "./page"
import { NOTE_INTRO } from "@/components/game/StudentNote"

vi.mock("@/lib/apiClient", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/apiClient")>()),
  clientApi: { sendFeedback: vi.fn() },
}))

describe("page /avis/ (lien « Donne ton avis »)", () => {
  it("montre le meme formulaire que la fin de 2e partie, et n'est pas indexee", () => {
    render(<AvisPage />)
    expect(screen.getByText(NOTE_INTRO)).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Ton message" })).toBeVisible()
    expect(metadata.robots).toMatchObject({ index: false })
  })
})
