// Liens vers l'exterieur (Spotify, Deezer) : dans l'iframe d'une Activite
// Discord, un lien target=_blank est bloque ; ils passent par le SDK.
import { afterEach, describe, expect, it, vi } from "vitest"
import { followExternalLink, setExternalLinkOpener } from "@/lib/externalLink"

afterEach(() => setExternalLinkOpener(null))

const click = () => ({ preventDefault: vi.fn() })

describe("followExternalLink", () => {
  it("sur le site : le navigateur suit le lien, rien n'est intercepte", () => {
    const event = click()
    followExternalLink(event, "https://open.spotify.com/track/x")
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it("dans l'Activite : le lien passe par l'ouvreur du SDK", () => {
    const opener = vi.fn()
    setExternalLinkOpener(opener)
    const event = click()
    followExternalLink(event, "https://open.spotify.com/track/x")
    expect(event.preventDefault).toHaveBeenCalled()
    expect(opener).toHaveBeenCalledWith("https://open.spotify.com/track/x")
  })
})
