// Discord charge l'Activite avec frame_id, instance_id et platform dans
// l'adresse. Sans eux, la page n'est pas dans Discord : on le dit au lieu de
// laisser le SDK lever une exception.
import { describe, expect, it } from "vitest"
import { readActivityParams } from "@/lib/discord/activityParams"

describe("readActivityParams", () => {
  it("lit les parametres poses par Discord", () => {
    expect(readActivityParams("?frame_id=f-1&instance_id=i-4f2a&platform=desktop&channel_id=42&guild_id=7"))
      .toEqual({ frameId: "f-1", instanceId: "i-4f2a", platform: "desktop", channelId: "42", guildId: "7" })
  })

  it("mobile aussi, et les identifiants optionnels valent null", () => {
    expect(readActivityParams("?frame_id=f&instance_id=i&platform=mobile"))
      .toEqual({ frameId: "f", instanceId: "i", platform: "mobile", channelId: null, guildId: null })
  })

  it("hors Discord (parametre manquant ou plateforme inconnue) : null", () => {
    expect(readActivityParams("")).toBeNull()
    expect(readActivityParams("?instance_id=i&platform=desktop")).toBeNull()
    expect(readActivityParams("?frame_id=f&platform=desktop")).toBeNull()
    expect(readActivityParams("?frame_id=f&instance_id=i&platform=console")).toBeNull()
  })

  it("un identifiant d'instance a la forme impossible est refuse (il part au serveur)", () => {
    expect(readActivityParams("?frame_id=f&instance_id=%3Cscript%3E&platform=desktop")).toBeNull()
    expect(readActivityParams(`?frame_id=f&instance_id=${"a".repeat(65)}&platform=desktop`)).toBeNull()
  })
})
