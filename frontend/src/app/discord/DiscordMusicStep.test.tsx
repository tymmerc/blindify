/**
 * « Ta musique », juste apres la connexion dans l'Activite (demande de Tym du
 * 14/10/2026) : on amene sa musique avant d'entrer dans la salle, on peut
 * entrer sans. Les reglages de partie restent dans le lobby.
 */
import { useEffect } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ links: [] as Array<{ id: number; active: boolean; track_count: number }> }))

vi.mock("@/components/import/MusicLibrary", () => ({
  MusicLibrary: function MockLibrary({ onLinksChange }: { onLinksChange?: (links: unknown[]) => void }) {
    useEffect(() => { onLinksChange?.(mocks.links) }, [onLinksChange])
    return <p>Bibliotheque</p>
  },
}))
vi.mock("@/components/import/ProfileImportBlock", () => ({
  ProfileImportBlock: () => <p>Import par lien</p>,
}))

import { DiscordMusicStep } from "./DiscordMusicStep"

beforeEach(() => {
  mocks.links = []
})

describe("DiscordMusicStep", () => {
  it("propose de coller un lien ou de reprendre sa bibliotheque", () => {
    render(<DiscordMusicStep mode="launch" onContinue={vi.fn()} />)
    expect(screen.getByRole("heading", { name: /ta musique/i })).toBeInTheDocument()
    expect(screen.getByText("Import par lien")).toBeInTheDocument()
    expect(screen.getByText("Bibliotheque")).toBeInTheDocument()
  })

  it("sans musique cochee : on peut passer et entrer sans", () => {
    const onContinue = vi.fn()
    render(<DiscordMusicStep mode="launch" onContinue={onContinue} />)
    fireEvent.click(screen.getByRole("button", { name: /entrer sans musique/i }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it("avec de la musique cochee : Entrer dans la salle", () => {
    mocks.links = [{ id: 1, active: true, track_count: 40 }]
    render(<DiscordMusicStep mode="launch" onContinue={vi.fn()} />)
    expect(screen.getByRole("button", { name: /entrer dans la salle/i })).toBeInTheDocument()
  })

  it("pendant l'entree : bouton occupe ; en cas de refus : le message", () => {
    const { rerender } = render(<DiscordMusicStep mode="launch" onContinue={vi.fn()} entering />)
    expect(screen.getByRole("button", { name: /on entre/i })).toBeDisabled()
    rerender(<DiscordMusicStep mode="launch" onContinue={vi.fn()} error="La salle est pleine" />)
    expect(screen.getByText("La salle est pleine")).toBeInTheDocument()
  })

  it("depuis le lobby : on y retourne, sans quitter la salle", () => {
    const onContinue = vi.fn()
    render(<DiscordMusicStep mode="edit" onContinue={onContinue} />)
    fireEvent.click(screen.getByRole("button", { name: /retour au lobby/i }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
