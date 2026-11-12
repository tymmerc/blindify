import { describe, expect, it } from "vitest"
import { entryNickname, joinEntryPath, lobbyAddress } from "./roomAddress"

describe("roomAddress", () => {
  it("avec un code, le pseudo de l'adresse n'est jamais repris", () => {
    expect(entryNickname({ urlNick: "Mae", storedNick: "Manou", code: "VRLVDU" })).toEqual({ nickname: "Manou", needsName: false })
    expect(entryNickname({ urlNick: "Mae", storedNick: null, code: "VRLVDU" })).toEqual({ nickname: null, needsName: true })
    expect(entryNickname({ urlNick: "Mae", storedNick: "  ", code: "VRLVDU" }).needsName).toBe(true)
  })

  it("sans code (creation), le pseudo de l'adresse passe devant", () => {
    expect(entryNickname({ urlNick: "Mae", storedNick: "Vieux", code: null })).toEqual({ nickname: "Mae", needsName: false })
    expect(entryNickname({ urlNick: null, storedNick: "Vieux", code: null }).nickname).toBe("Vieux")
  })

  it("l'adresse gardee dans la salle n'a plus ni role ni pseudo", () => {
    const out = new URL(lobbyAddress("https://blindz.app/multiplayer/?mode=event&intent=host&nickname=Mae", "VRLVDU"))
    expect(out.pathname).toBe("/multiplayer/")
    expect(Object.fromEntries(out.searchParams)).toEqual({ mode: "event", code: "VRLVDU" })
  })

  it("l'entree du QR nettoie le code", () => {
    expect(joinEntryPath("vr-lvdu")).toBe("/jouer/?join=VRLVDU")
  })
})
