// T15 (17/10/2026) : la connexion au compte Spotify est retiree. Chaque joueur
// colle le lien d'une playlist ou d'un profil public ; personne ne se connecte.
// Ces tests gardent le front sans trace de cette connexion.
import fs from "fs"
import { describe, expect, it } from "vitest"
import path from "path"

const SRC = path.resolve(__dirname, "..")
const ROOT = path.resolve(SRC, "..", "..")

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

const files = sourceFiles(SRC).map(file => ({ file: path.relative(SRC, file), text: fs.readFileSync(file, "utf8") }))

function filesMatching(pattern: RegExp): string[] {
  return files.filter(({ text }) => pattern.test(text)).map(({ file }) => file)
}

describe("connexion au compte Spotify retiree", () => {
  it("la page settings/providers n'existe plus", () => {
    expect(fs.existsSync(path.join(SRC, "app", "settings", "providers"))).toBe(false)
  })

  it("aucun lien interne ne mene vers settings/providers", () => {
    expect(filesMatching(/settings\/providers/)).toEqual([])
  })

  it("aucune page n'affiche « Connecter Spotify » ni un appel a se connecter a Spotify", () => {
    expect(filesMatching(/Connecte[rz]? (ton |ta |votre |son |mon )?(compte )?Spotify/i)).toEqual([])
  })

  it("le front ne parle plus a accounts.spotify.com", () => {
    expect(filesMatching(/accounts\.spotify\.com/)).toEqual([])
  })

  it("plus de connexion de fournisseur dans l'utilisateur courant", () => {
    expect(filesMatching(/providerConnection|ProviderConnectionSummary/)).toEqual([])
  })

  it("plus de sources qui demandaient le compte connecte (tops, likes, playlist du compte)", () => {
    expect(filesMatching(/["'](top_week|top_month|top_all|liked)["']/)).toEqual([])
  })
})

describe("CSP de blindz.app (deploy/nginx-blindz.app.conf)", () => {
  const conf = fs.readFileSync(path.join(ROOT, "deploy", "nginx-blindz.app.conf"), "utf8")
  const csp = conf.split("\n").find(line => line.includes("Content-Security-Policy")) ?? ""

  it("n'autorise plus accounts.spotify.com ni api.spotify.com (plus d'OAuth dans le navigateur)", () => {
    expect(csp).not.toBe("")
    expect(csp).not.toMatch(/accounts\.spotify\.com/)
    expect(csp).not.toMatch(/api\.spotify\.com/)
  })

  it("ne relaie plus l'ancienne connexion OAuth (/auth/spotify/login)", () => {
    expect(conf).not.toMatch(/location[^\n]*auth\/spotify/)
  })

  // Le miroir avait diverge du fichier en place (pas de proxy_protocol) : une
  // copie aurait fait tomber le site. Il suit maintenant le fichier en place.
  it("suit le fichier en place : proxy_protocol sur le 443 et journal dedie", () => {
    expect(conf).toMatch(/listen 127\.0\.0\.1:8443 ssl proxy_protocol;/)
    expect(conf).toMatch(/access_log \/var\/log\/nginx\/blindz-access\.log/)
    expect(conf).toMatch(/NE JAMAIS COPIER/)
  })

  it("garde les extraits Deezer et l'encadrement par blindz.app", () => {
    expect(csp).toMatch(/media-src[^;]*https:\/\/\*\.dzcdn\.net/)
    expect(csp).toMatch(/frame-ancestors 'self' https:\/\/blindz\.app/)
  })
})
