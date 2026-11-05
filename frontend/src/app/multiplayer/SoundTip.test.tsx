import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SoundTip } from "./EventLobbyView"

// T7 (01/11) : un seul telephone a joue la musique pour trois pendant 1 h 45.
describe("SoundTip : ou sort le son autour d'une table", () => {
  it("l'hote qui joue aussi : brancher son telephone sur une enceinte ou la tele", () => {
    render(<SoundTip hostPlays />)
    expect(screen.getByTestId("lobby-son")).toHaveTextContent(/seulement de ton téléphone/)
    expect(screen.getByTestId("lobby-son")).toHaveTextContent(/enceinte/)
  })

  it("l'ecran central : verifier que le son passe par la tele", () => {
    render(<SoundTip hostPlays={false} />)
    expect(screen.getByTestId("lobby-son")).toHaveTextContent(/sort de cet écran/)
  })
})
