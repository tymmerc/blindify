import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PlayerAvatar } from "./PlayerAvatar"

describe("PlayerAvatar", () => {
  it("montre la photo quand le joueur en a une", () => {
    const { container } = render(<PlayerAvatar name="Lila" avatarUrl="/api/photos/0f8fad5b-d9cb-469f-a165-70867728950e.webp" />)
    const img = container.querySelector("img")
    expect(img?.getAttribute("src")).toMatch(/\/api\/photos\/0f8fad5b-d9cb-469f-a165-70867728950e\.webp$/)
    expect(img).toHaveAttribute("alt", "")
  })

  it("sans photo : l'initiale", () => {
    const { getByTestId } = render(<PlayerAvatar name="noé" avatarUrl={null} />)
    expect(getByTestId("player-avatar")).toHaveTextContent("N")
  })

  it("une photo qui ne charge pas retombe sur l'initiale", () => {
    const { container, getByTestId } = render(<PlayerAvatar name="Sam" avatarUrl="https://cdn.discordapp.com/avatars/1/a.png" />)
    fireEvent.error(container.querySelector("img") as HTMLImageElement)
    expect(container.querySelector("img")).toBeNull()
    expect(getByTestId("player-avatar")).toHaveTextContent("S")
  })

  it("une adresse inattendue n'est jamais mise dans src", () => {
    const { container } = render(<PlayerAvatar name="Max" avatarUrl="javascript:alert(1)" />)
    expect(container.querySelector("img")).toBeNull()
  })
})
