import { describe, expect, it } from "vitest"
import { safeReturnTo } from "./returnTo"

describe("safeReturnTo : ou revenir apres la connexion", () => {
  it("garde un chemin interne au site, requete comprise", () => {
    expect(safeReturnTo("/multiplayer/?code=AB12", "/modes", "")).toBe("/multiplayer/?code=AB12")
    expect(safeReturnTo("/solo/", "/modes", "")).toBe("/solo/")
  })

  it("retombe sur la page par defaut sans valeur", () => {
    expect(safeReturnTo(null, "/modes", "")).toBe("/modes")
    expect(safeReturnTo("", "/modes", "")).toBe("/modes")
  })

  it("refuse tout ce qui sortirait du site", () => {
    for (const raw of [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example/",
      "\\\\evil.example",
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "evil.example",
    ]) {
      expect(safeReturnTo(raw, "/modes", "")).toBe("/modes")
    }
  })

  it("refuse les caracteres de controle (retour a la ligne, tabulation)", () => {
    expect(safeReturnTo("/\n/evil.example", "/modes", "")).toBe("/modes")
    expect(safeReturnTo("/\t/evil.example", "/modes", "")).toBe("/modes")
  })

  it("retire le basePath, que le routeur de Next rajoute lui-meme", () => {
    expect(safeReturnTo("/blindify/multiplayer/?code=AB12", "/modes", "/blindify")).toBe("/multiplayer/?code=AB12")
    expect(safeReturnTo("/blindify", "/modes", "/blindify")).toBe("/")
    // Un chemin qui commence seulement pareil n'est pas le basePath.
    expect(safeReturnTo("/blindifyx/page", "/modes", "/blindify")).toBe("/blindifyx/page")
  })
})
