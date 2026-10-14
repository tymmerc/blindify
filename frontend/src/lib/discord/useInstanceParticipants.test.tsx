// Qui est dans le salon vocal : la liste du SDK au montage, puis ses mises a
// jour (arrivees, departs). Les noms viennent de Discord et sont affiches tels
// quels par React (pas de HTML).
import { DiscordSDKMock } from "@discord/embedded-app-sdk"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { participantName, useInstanceParticipants } from "@/lib/discord/useInstanceParticipants"

const P = (id: string, username: string, extra: Record<string, unknown> = {}) => ({
  id, username, discriminator: "0", avatar: null, flags: 0, bot: false, ...extra,
})

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {})
})

describe("useInstanceParticipants", () => {
  it("sans SDK : liste vide", () => {
    const { result } = renderHook(() => useInstanceParticipants(null))
    expect(result.current).toEqual([])
  })

  it("lit les participants au montage, puis suit les mises a jour", async () => {
    const sdk = new DiscordSDKMock("123456789012345678", null, null, null)
    sdk._updateCommandMocks({
      getInstanceConnectedParticipants: () => Promise.resolve({ participants: [P("1", "tym", { global_name: "Tym" }), P("2", "lea")] }),
    })
    const { result, unmount } = renderHook(() => useInstanceParticipants(sdk))

    await waitFor(() => expect(result.current).toHaveLength(2))
    expect(result.current).toEqual([
      { id: "1", name: "Tym" },
      { id: "2", name: "lea" },
    ])

    act(() => {
      sdk.emitEvent("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", { participants: [P("2", "lea", { nickname: "Léa du salon" })] })
    })
    expect(result.current).toEqual([{ id: "2", name: "Léa du salon" }])

    unmount()
    act(() => {
      sdk.emitEvent("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", { participants: [] })
    })
    // Plus d'ecouteur apres le demontage : rien ne casse.
  })
})

describe("participantName", () => {
  it("surnom du serveur, sinon nom d'affichage, sinon pseudo", () => {
    expect(participantName(P("1", "tym", { nickname: "Le Tym", global_name: "Tym" }))).toBe("Le Tym")
    expect(participantName(P("1", "tym", { global_name: "Tym" }))).toBe("Tym")
    expect(participantName(P("1", "tym"))).toBe("tym")
    expect(participantName(P("1", "tym", { nickname: "  ", global_name: null }))).toBe("tym")
  })
})
