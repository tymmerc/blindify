// Dans l'iframe d'une Activite, chaque domaine externe passe par le proxy de
// Discord sous /.proxy/<prefixe>. Le portail developpeur porte les memes
// correspondances (docs/DISCORD-POUR-TYM.md) : ces deux listes doivent rester
// identiques, d'ou des constantes et ces tests.
import { describe, expect, it } from "vitest"
import {
  BLINDZ_MAPPING_PREFIX,
  DEEZER_MAPPING_PREFIX,
  buildUrlMappings,
  createPreviewSrcMapper,
  remapUrl,
} from "@/lib/discord/urlMappings"

const HERE = window.location.host // jsdom : localhost:3000

describe("buildUrlMappings", () => {
  it("prod : l'API et le socket de blindz.app, puis les extraits Deezer (sous-domaine variable)", () => {
    expect(buildUrlMappings("https://blindz.app")).toEqual([
      { prefix: "/.proxy/blindz", target: "blindz.app" },
      { prefix: "/.proxy/dzcdn/{subdomain}", target: "{subdomain}.dzcdn.net" },
    ])
    expect(BLINDZ_MAPPING_PREFIX).toBe("/.proxy/blindz")
    expect(DEEZER_MAPPING_PREFIX).toBe("/.proxy/dzcdn/{subdomain}")
  })

  it("pile de test : hote avec port et chemin de base, sans protocole ni barre finale", () => {
    expect(buildUrlMappings("http://blindz-test.localhost:3180/blindify/")[0])
      .toEqual({ prefix: "/.proxy/blindz", target: "blindz-test.localhost:3180/blindify" })
  })
})

describe("remapUrl", () => {
  const mappings = buildUrlMappings("https://blindz.app")

  it("reecrit une adresse de l'API vers le proxy, sur l'origine de la page", () => {
    const out = new URL(remapUrl("https://blindz.app/api/auth/me?x=1", mappings))
    expect(out.host).toBe(HERE)
    expect(out.pathname).toBe("/.proxy/blindz/api/auth/me")
    expect(out.search).toBe("?x=1")
  })

  it("reecrit un extrait Deezer en gardant le sous-domaine dans le chemin", () => {
    const out = new URL(remapUrl("https://cdnt-preview.dzcdn.net/api/1/1/abc.mp3", mappings))
    expect(out.host).toBe(HERE)
    expect(out.pathname).toBe("/.proxy/dzcdn/cdnt-preview/api/1/1/abc.mp3")
  })

  it("laisse tranquilles les adresses relatives, data: et celles d'un autre hote", () => {
    expect(remapUrl("/test-audio/a.mp3", mappings)).toBe("/test-audio/a.mp3")
    expect(remapUrl("data:audio/wav;base64,UklGRg==", mappings)).toBe("data:audio/wav;base64,UklGRg==")
    expect(remapUrl("https://example.org/x.mp3", mappings)).toBe("https://example.org/x.mp3")
  })

  it("pile de test : l'API sous /blindify perd son chemin de base dans la reecriture", () => {
    const pile = buildUrlMappings("http://blindz-test.localhost:3180/blindify")
    const out = new URL(remapUrl("http://blindz-test.localhost:3180/blindify/socket.io/?EIO=4", pile))
    expect(out.pathname).toBe("/.proxy/blindz/socket.io/")
    expect(out.search).toBe("?EIO=4")
  })
})

describe("createPreviewSrcMapper", () => {
  it("donne a l'audio l'adresse proxifiee des extraits, et rien d'autre ne change", () => {
    const map = createPreviewSrcMapper(buildUrlMappings("https://blindz.app"))
    expect(new URL(map("https://cdns-preview-a.dzcdn.net/stream/c-abc.mp3")).pathname)
      .toBe("/.proxy/dzcdn/cdns-preview-a/stream/c-abc.mp3")
    expect(map("data:audio/wav;base64,UklGRg==")).toBe("data:audio/wav;base64,UklGRg==")
    expect(map("")).toBe("")
  })
})
