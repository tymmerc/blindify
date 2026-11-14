// Le podium de fin de partie : « Retour modes » existe sur le site, pas dans
// l'Activite Discord (pas de menu : on reste sur le podium jusqu'au Rejouer de
// l'hote, et le bouton grise le dit).
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/game/ConfettiBurst", () => ({ ConfettiBurst: () => null }))
vi.mock("@/components/InstallApp", () => ({ InstallApp: () => null }))
vi.mock("@/components/game/EndFeedback", () => ({ EndFeedback: () => <div data-testid="end-feedback" /> }))
const roomRounds = vi.fn().mockResolvedValue({ rounds: [], players: [] })
vi.mock("@/lib/api", () => ({ api: { roomRounds: (code: string) => roomRounds(code) } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

import { ResultsView } from "./LobbyViews"

const leaderboard = [
  { userId: 1, username: "Tym", score: 10, accuracy: 1 },
  { userId: 2, username: "Léa", score: 5, accuracy: 0 },
]

describe("ResultsView", () => {
  it("sur le site : « Retour modes » et « Rejouer » pour l'hote", () => {
    render(<ResultsView leaderboard={leaderboard} tracks={[]} currentUserId={1} onReturn={() => {}} onReplay={() => {}} isHost />)
    expect(screen.getByRole("button", { name: /retour modes/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /rejouer/i })).toBeInTheDocument()
  })

  it("dans Discord (pas de retour) : aucun « Retour modes », l'invite voit que l'hote relance", () => {
    render(<ResultsView leaderboard={leaderboard} tracks={[]} currentUserId={2} onReplay={() => {}} isHost={false} />)
    expect(screen.queryByRole("button", { name: /retour modes/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /l'hôte peut relancer/i })).toBeDisabled()
  })

  // T7 (01/11) : pour changer de musique entre deux parties, une bande a quitte
  // sa salle. Le bouton ouvre « Ta musique » sans quitter, pour tout le monde.
  it("« Changer la musique » ouvre la musique sans quitter la salle, invite compris", () => {
    const onEditMusic = vi.fn()
    const onReturn = vi.fn()
    render(<ResultsView leaderboard={leaderboard} tracks={[]} currentUserId={2} onReturn={onReturn} onReplay={() => {}} onEditMusic={onEditMusic} isHost={false} />)
    fireEvent.click(screen.getByRole("button", { name: /changer la musique/i }))
    expect(onEditMusic).toHaveBeenCalledTimes(1)
    expect(onReturn).not.toHaveBeenCalled()
  })

  it("sans fenetre de musique (streamer), pas de bouton", () => {
    render(<ResultsView leaderboard={leaderboard} tracks={[]} currentUserId={1} onReplay={() => {}} isHost />)
    expect(screen.queryByRole("button", { name: /changer la musique/i })).not.toBeInTheDocument()
  })

  // 08/11 : le lien du serveur Discord est aussi sur l'ecran partage d'une
  // partie autour d'une table, ou il n'y a pas d'avis a donner.
  it("ecran partage sans avis : montre quand meme le lien du serveur Discord", () => {
    render(<ResultsView leaderboard={leaderboard} tracks={[]} currentUserId={1} onReplay={() => {}} isHost feedback={null} />)
    expect(screen.queryByTestId("end-feedback")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /serveur Discord de Blindz/ })).toHaveAttribute("href", "https://discord.gg/8pyAtVDFzU")
  })

  it("avec un avis a donner, le lien vient du bloc d'avis (pas de doublon)", () => {
    render(<ResultsView leaderboard={leaderboard} tracks={[]} currentUserId={2} onReplay={() => {}} isHost={false} feedback={{ mode: "friends", gameCode: "AB12CD" }} />)
    expect(screen.getByTestId("end-feedback")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /serveur Discord de Blindz/ })).not.toBeInTheDocument()
  })

  // T40 : revenir dans la salle d'attente sans relancer ni repasser par les modes.
  it("« Revenir à la salle » chez l'hote seulement", () => {
    const onBackToLobby = vi.fn()
    const { unmount } = render(<ResultsView leaderboard={leaderboard} tracks={[]} currentUserId={1} onReplay={() => {}} onBackToLobby={onBackToLobby} isHost />)
    fireEvent.click(screen.getByRole("button", { name: /revenir à la salle/i }))
    expect(onBackToLobby).toHaveBeenCalledTimes(1)
    unmount()
    render(<ResultsView leaderboard={leaderboard} tracks={[]} currentUserId={2} onReplay={() => {}} isHost={false} />)
    expect(screen.queryByTestId("revenir-salle")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /revenir à la salle/i })).toBeDisabled()
  })

  it("montre les moments de la partie tires du bilan", async () => {
    roomRounds.mockResolvedValueOnce({
      rounds: [
        { round: 1, title: "Alors on danse", artist: "Stromae", answers: 2, correct: 1, ownerUserId: 1 },
        { round: 2, title: "Formidable", artist: "Stromae", answers: 1, correct: 0, ownerUserId: 1 },
      ],
      players: [],
      responses: [
        { round: 1, userId: 1, guessTitle: "alors on danse", guessArtist: "stromae", gained: 3 },
        { round: 1, userId: 2, guessTitle: "jsp", guessArtist: "le belge", gained: 0 },
        { round: 2, userId: 2, guessTitle: "formidable", guessArtist: "", gained: 0 },
      ],
    })
    render(<ResultsView leaderboard={leaderboard} tracks={[]} currentUserId={1} onReplay={() => {}} isHost roomCode="AB12CD" />)
    await waitFor(() => expect(screen.getByTestId("moment-wildest")).toHaveTextContent("jsp · le belge"))
    expect(screen.getByTestId("moment-missed")).toHaveTextContent("Formidable")
    expect(screen.getByTestId("moment-missed")).toHaveTextContent("Le morceau de Tym")
  })
})
