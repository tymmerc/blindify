import { beforeEach, describe, expect, it } from "vitest"
import { HOSTED_ROOMS_KEY, findHostedRoom, forgetHostedRoom, rememberHostedRoom, updateHostedRoom } from "./hostedRooms"

const base = { mode: "event" as const, hostPlays: true, questionCount: 10, roundSeconds: 20 }

describe("hostedRooms : les salles creees dans ce navigateur", () => {
  beforeEach(() => window.localStorage.removeItem(HOSTED_ROOMS_KEY))

  it("retrouve une salle notee, quelle que soit la casse du code", () => {
    rememberHostedRoom({ ...base, code: "abc123" })
    expect(findHostedRoom("ABC123")).toMatchObject({ code: "ABC123", mode: "event", hostPlays: true })
    expect(findHostedRoom(" a-b-c-1-2-3 ")?.code).toBe("ABC123")
    expect(findHostedRoom("ZZZ999")).toBeNull()
  })

  it("met a jour les reglages sans dupliquer la salle", () => {
    rememberHostedRoom({ ...base, code: "ABC123" })
    updateHostedRoom("ABC123", { questionCount: 20 })
    updateHostedRoom("ABC123", { roundSeconds: 30 })
    rememberHostedRoom({ ...base, code: "ABC123", questionCount: 20, roundSeconds: 30 })
    const all = JSON.parse(window.localStorage.getItem(HOSTED_ROOMS_KEY) ?? "[]")
    expect(all).toHaveLength(1)
    expect(findHostedRoom("ABC123")).toMatchObject({ questionCount: 20, roundSeconds: 30 })
  })

  it("ignore un reglage pour une salle inconnue", () => {
    updateHostedRoom("NOPE12", { questionCount: 20 })
    expect(window.localStorage.getItem(HOSTED_ROOMS_KEY)).toBeNull()
  })

  it("garde les 8 plus recentes, la derniere devant", () => {
    for (let i = 0; i < 10; i++) rememberHostedRoom({ ...base, code: `ROOM${i}0` }, 1000 + i)
    const all = JSON.parse(window.localStorage.getItem(HOSTED_ROOMS_KEY) ?? "[]") as Array<{ code: string }>
    expect(all).toHaveLength(8)
    expect(all[0].code).toBe("ROOM90")
    expect(findHostedRoom("ROOM00")).toBeNull()
  })

  it("oublie une salle", () => {
    rememberHostedRoom({ ...base, code: "ABC123" })
    forgetHostedRoom("abc123")
    expect(findHostedRoom("ABC123")).toBeNull()
  })

  it("ne croit pas un stockage abime ou trafique", () => {
    window.localStorage.setItem(HOSTED_ROOMS_KEY, "pas du json")
    expect(findHostedRoom("ABC123")).toBeNull()
    window.localStorage.setItem(HOSTED_ROOMS_KEY, JSON.stringify([{ code: "ABC123", mode: "admin", hostPlays: true, questionCount: 10, roundSeconds: 20, savedAt: 1 }]))
    expect(findHostedRoom("ABC123")).toBeNull()
  })
})
