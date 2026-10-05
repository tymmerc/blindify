import { describe, expect, it } from "vitest"
import { ApiError } from "./apiClient"
import { challengeLoadProblem, playerErrorText } from "./errorText"

const FALLBACK = "Message en francais"

describe("playerErrorText", () => {
  it("montre le message du backend quand il vient avec un code", () => {
    const err = new ApiError(400, "Aucune playlist publique trouvée.", "no_playlists")
    expect(playerErrorText(err, FALLBACK)).toBe("Aucune playlist publique trouvée.")
  })

  it("ne montre jamais l'erreur reseau du navigateur", () => {
    expect(playerErrorText(new TypeError("Failed to fetch"), FALLBACK)).toBe(FALLBACK)
    expect(playerErrorText(new TypeError("Load failed"), FALLBACK)).toBe(FALLBACK)
  })

  it("ne montre pas le statut HTTP brut d'un proxy (sans code)", () => {
    expect(playerErrorText(new ApiError(502, "Bad Gateway"), FALLBACK)).toBe(FALLBACK)
  })

  it("retombe sur le texte par defaut pour tout le reste", () => {
    expect(playerErrorText("boom", FALLBACK)).toBe(FALLBACK)
    expect(playerErrorText(new ApiError(400, "", "no_tracks"), FALLBACK)).toBe(FALLBACK)
  })
})

describe("challengeLoadProblem", () => {
  it("400 et 404 : le defi n'existe pas", () => {
    expect(challengeLoadProblem(new ApiError(404, "Defi introuvable", "challenge_not_found"))).toBe("missing")
    expect(challengeLoadProblem(new ApiError(400, "Code de defi invalide", "invalid_code"))).toBe("missing")
  })

  it("le reste (reseau, serveur, trop de requetes) : on peut reessayer", () => {
    expect(challengeLoadProblem(new TypeError("Failed to fetch"))).toBe("network")
    expect(challengeLoadProblem(new ApiError(500, "Impossible de charger le defi", "challenge_get_error"))).toBe("network")
    expect(challengeLoadProblem(new ApiError(429, "Trop de requêtes.", "rate_limited"))).toBe("network")
  })
})
