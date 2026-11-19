import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { RoundAnswerScreen } from "./RoundAnswerScreen"
import type { MultiplayerPlayerState } from "@/lib/types"

// T43 : chaque joueur voit ses points de la manche et leur detail, en haut de la liste.
const track = { round: 1, trackId: "t1", title: "Formidable", artist: "Stromae", previewUrl: null, metadata: null }
const players: MultiplayerPlayerState[] = [
  {
    userId: 1, username: "Lou", score: 1270, hasAnswered: true, isReady: false, lastVerdict: "correct",
    lastGuessTitle: "Formidable", lastGuessArtist: "Stromae", lastTitleOk: true, lastArtistOk: true,
    lastGained: 1270, lastPoints: { answer: 870, streak: 200, owner: 200, ms: 4_200 }, streak: 3,
  },
  { userId: 2, username: "Max", score: 0, hasAnswered: true, isReady: false, lastVerdict: "wrong", lastGained: 0, streak: 0 },
]

describe("RoundAnswerScreen : ses points (T43)", () => {
  it("montre ses points, leur detail et sa serie sur son ecran", () => {
    render(<RoundAnswerScreen track={track} players={players} meId={1} />)
    const mine = screen.getByTestId("mes-points")
    expect(mine.textContent).toContain("Tes points")
    expect(mine.textContent).toContain("+1 270")
    expect(screen.getByTestId("detail-points").textContent).toContain("titre et artiste en 4,2 s")
    expect(screen.getByTestId("detail-points").textContent).toContain("qui a ajouté")
    expect(screen.getByTestId("ma-serie").textContent).toBe("Série de 3")
  })

  it("rien de tout ca sur l'ecran central", () => {
    render(<RoundAnswerScreen track={track} players={players} meId={null} large />)
    expect(screen.queryByTestId("mes-points")).toBeNull()
  })

  it("le credit Deezer reste affiche, en bas apres la liste, sans sur-titre « La réponse »", () => {
    for (const large of [false, true]) {
      const { container, unmount } = render(<RoundAnswerScreen track={track} players={players} meId={large ? null : 1} large={large} />)
      const logo = screen.getAllByAltText("Deezer")[0]
      const list = container.querySelector("ol")!
      expect(list.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(container.textContent).not.toContain("La réponse")
      unmount()
    }
  })

  it("+0 sans detail quand on n'a rien trouve", () => {
    render(<RoundAnswerScreen track={track} players={players} meId={2} />)
    expect(screen.getByTestId("mes-points").textContent).toContain("+0")
    expect(screen.queryByTestId("detail-points")).toBeNull()
  })
})
