// Le podium de fin de partie : « Retour modes » existe sur le site, pas dans
// l'Activite Discord (pas de menu : on reste sur le podium jusqu'au Rejouer de
// l'hote, et le bouton grise le dit).
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/game/ConfettiBurst", () => ({ ConfettiBurst: () => null }))
vi.mock("@/components/InstallApp", () => ({ InstallApp: () => null }))
vi.mock("@/components/game/EndFeedback", () => ({ EndFeedback: () => null }))
vi.mock("@/lib/api", () => ({ api: { roomRounds: vi.fn().mockResolvedValue({ rounds: [], players: [] }) } }))
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
})
