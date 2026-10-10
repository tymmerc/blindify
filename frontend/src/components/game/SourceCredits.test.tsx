import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { DeezerCredit, SpotifyTrackLink, spotifyTrackUrl } from "./SourceCredits"

// Obligations des API musicales (docs/CONDITIONS-API-MUSIQUE.md) :
// - Deezer : logo « clearly visible » la ou les extraits jouent, et prevenir
//   les joueurs que l'ecoute est reservee a un usage prive ;
// - Spotify : logo et lien retour vers le morceau, sur les titres importes de
//   Spotify. Ce lien EST la reponse : il ne s'affiche qu'au reveal (les ecrans
//   ne le rendent que dans leur carte de reveal, la piste est caviardee avant).

afterEach(() => cleanup())

const SPOTIFY_ID = "4uLU6hMCjMI75M1A2tKUQC"

describe("DeezerCredit", () => {
  it("montre le logo officiel Deezer, nomme pour les lecteurs d'ecran", () => {
    render(<DeezerCredit />)
    const logo = screen.getByRole("img", { name: "Deezer" })
    expect(logo.getAttribute("src")).toMatch(/\/marques\/deezer-logo\.png$/)
  })

  it("previent que l'ecoute est reservee a un usage prive", () => {
    render(<DeezerCredit />)
    expect(screen.getByText(/écoute privée/i)).toBeInTheDocument()
  })

  it("version courte : le logo seul, sans la phrase", () => {
    render(<DeezerCredit notice={false} />)
    expect(screen.getByRole("img", { name: "Deezer" })).toBeInTheDocument()
    expect(screen.queryByText(/écoute privée/i)).toBeNull()
  })
})

describe("spotifyTrackUrl", () => {
  it("donne le lien du morceau Spotify", () => {
    expect(spotifyTrackUrl("spotify", SPOTIFY_ID)).toBe(`https://open.spotify.com/track/${SPOTIFY_ID}`)
  })

  it("rien pour un morceau Deezer, une piste caviardee ou un identifiant douteux", () => {
    expect(spotifyTrackUrl("deezer", "3135556")).toBeNull()
    expect(spotifyTrackUrl("spotify", "hidden")).toBeNull()
    expect(spotifyTrackUrl(undefined, SPOTIFY_ID)).toBeNull()
    expect(spotifyTrackUrl("spotify", `${SPOTIFY_ID}/../x`)).toBeNull()
  })
})

describe("SpotifyTrackLink", () => {
  it("lien « Écouter sur Spotify » avec le logo Spotify, dans un nouvel onglet", () => {
    render(<SpotifyTrackLink provider="spotify" trackId={SPOTIFY_ID} />)
    const link = screen.getByRole("link", { name: /écouter sur spotify/i })
    expect(link.getAttribute("href")).toBe(`https://open.spotify.com/track/${SPOTIFY_ID}`)
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toContain("noopener")
    const logo = link.querySelector("img")
    expect(logo?.getAttribute("src")).toMatch(/\/marques\/spotify-logo-noir\.svg$/)
  })

  it("rien du tout pour un morceau qui ne vient pas de Spotify", () => {
    const { container } = render(<SpotifyTrackLink provider="deezer" trackId="3135556" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("rien du tout pendant la manche (piste caviardee)", () => {
    const { container } = render(<SpotifyTrackLink provider={undefined} trackId="hidden" />)
    expect(container).toBeEmptyDOMElement()
  })
})
