// Reconnaissance d'un lien de musique a la saisie, avant l'envoi : les memes
// formes que le serveur (backend/src/services/profileImportService.ts,
// parseProfileUrl), plus les liens courts des applis, que le serveur refuse.
import { describe, expect, it } from "vitest"
import { recognizeMusicLink } from "@/lib/musicLink"

describe("recognizeMusicLink", () => {
  it.each([
    ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", { provider: "spotify", type: "playlist" }],
    ["https://open.spotify.com/intl-fr/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc", { provider: "spotify", type: "playlist" }],
    ["https://open.spotify.com/user/tymmerc", { provider: "spotify", type: "user" }],
    ["https://www.deezer.com/fr/playlist/1313621735", { provider: "deezer", type: "playlist" }],
    ["https://www.deezer.com/profile/5129203982", { provider: "deezer", type: "user" }],
    ["deezer.com/en/profile/5129203982", { provider: "deezer", type: "user" }],
    ["  https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M  ", { provider: "spotify", type: "playlist" }],
  ])("%s", (raw, expected) => {
    expect(recognizeMusicLink(raw)).toMatchObject({ kind: "ok", ...expected })
  })

  it("rend une adresse que le serveur accepte : https ajoute, segment intl-xx de Spotify retire", () => {
    expect(recognizeMusicLink("deezer.com/en/profile/5129203982")).toMatchObject({ url: "https://deezer.com/en/profile/5129203982" })
    expect(recognizeMusicLink("https://open.spotify.com/intl-fr/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc"))
      .toMatchObject({ url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc" })
  })

  it.each([
    "https://link.deezer.com/s/30ZnBD9L4b4a1R5V6NWDu",
    "https://deezer.page.link/abcd1234",
    "https://spotify.link/aBcD3fGh1Jb",
  ])("lien court d'appli : %s", raw => {
    expect(recognizeMusicLink(raw)).toEqual({ kind: "short" })
  })

  it.each([
    "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    "https://www.youtube.com/watch?v=x",
    "bonjour",
  ])("non reconnu : %s", raw => {
    expect(recognizeMusicLink(raw)).toEqual({ kind: "unknown" })
  })

  it("vide : rien a dire", () => {
    expect(recognizeMusicLink("   ")).toEqual({ kind: "empty" })
  })
})
