// T7 (01/11) : Manou est entree par l'adresse de la page de Maelia,
// /multiplayer/?mode=event&intent=host&nickname=Mae&code=VRLVDU, et un
// deuxieme « Mae » est apparu dans la salle.
import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ModeProvider } from "@/contexts/ModeContext"

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  router: { push: vi.fn(), replace: vi.fn() },
  lobby: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, useSearchParams: () => mocks.params }))
vi.mock("./ModeLobbyView", () => ({ ModeLobbyView: (props: unknown) => { mocks.lobby(props); return null } }))

import { MultiplayerRouter } from "./MultiplayerRouter"

const HOST_URL = "mode=event&intent=host&nickname=Mae&code=VRLVDU"
const lastProps = () => mocks.lobby.mock.calls.at(-1)?.[0] as { intent: string | null; initialNickname: string | null; initialJoinCode: string | null }

function renderAt(query: string) {
  mocks.params = new URLSearchParams(query)
  return render(<ModeProvider><MultiplayerRouter /></ModeProvider>)
}

describe("MultiplayerRouter : l'adresse de l'hote ouverte par quelqu'un d'autre", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it("sur un telephone sans pseudo : passe par l'entree du QR, qui demande le sien", () => {
    renderAt(HOST_URL)
    expect(mocks.router.replace).toHaveBeenCalledWith("/jouer/?join=VRLVDU")
    expect(mocks.lobby).not.toHaveBeenCalled()
  })

  it("avec son propre pseudo : entre comme invite, sous son nom", () => {
    window.localStorage.setItem("blindify_nickname", "Manou")
    renderAt(HOST_URL)
    expect(lastProps()).toMatchObject({ intent: null, initialNickname: "Manou", initialJoinCode: "VRLVDU" })
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })

  it("l'hote qui cree sa salle garde le pseudo de l'adresse, et ce navigateur s'en souvient", () => {
    renderAt("mode=friends&intent=host&nickname=Mae")
    expect(lastProps()).toMatchObject({ intent: "host", initialNickname: "Mae", initialJoinCode: null })
    expect(window.localStorage.getItem("blindify_nickname")).toBe("Mae")
  })
})
