import { resolveTestDatabaseUrl } from "./testDatabase"

describe("garde-fou de la base de test (resolveTestDatabaseUrl)", () => {
  it("refuse de partir sans TEST_DATABASE_URL", () => {
    expect(() => resolveTestDatabaseUrl(undefined)).toThrow(/TEST_DATABASE_URL manquante/)
    expect(() => resolveTestDatabaseUrl("")).toThrow(/TEST_DATABASE_URL manquante/)
  })

  it("refuse une adresse illisible ou qui n'est pas du Postgres", () => {
    expect(() => resolveTestDatabaseUrl("pas une adresse")).toThrow(/illisible/)
    expect(() => resolveTestDatabaseUrl("mysql://u:p@127.0.0.1:5437/blindz_test")).toThrow(/postgres:\/\//)
  })

  it("refuse une base dont le nom ne finit pas par _test", () => {
    expect(() => resolveTestDatabaseUrl("postgres://u:p@127.0.0.1:5437/blindify")).toThrow(/_test/)
    expect(() => resolveTestDatabaseUrl("postgres://u:p@127.0.0.1:5437/")).toThrow(/_test/)
  })

  it("refuse le port 5432, celui du Postgres de la prod, meme pour une base _test", () => {
    // L'ancien defaut de tests/setup.ts : la base blindify_test du serveur de prod.
    expect(() => resolveTestDatabaseUrl("postgres://blindify:x@localhost:5432/blindify_test")).toThrow(/5432/)
    // Sans port explicite, Postgres prend 5432.
    expect(() => resolveTestDatabaseUrl("postgres://blindify:x@127.0.0.1/blindify_test")).toThrow(/5432/)
    // Le meme serveur atteint par le reseau Docker.
    expect(() => resolveTestDatabaseUrl("postgresql://blindify:x@172.18.0.2:5432/blindify_test")).toThrow(/5432/)
  })

  it("accepte la base jetable sur son propre port, en local comme en CI", () => {
    const url = "postgres://blindz:blindz@127.0.0.1:5437/blindz_test"
    expect(resolveTestDatabaseUrl(url)).toBe(url)
    expect(resolveTestDatabaseUrl("postgresql://blindz:blindz@localhost:5437/blindz_test")).toMatch(/5437/)
  })

  it("ne recopie jamais le mot de passe dans le message d'erreur", () => {
    let message = ""
    try {
      resolveTestDatabaseUrl("postgres://blindify:motdepasse-secret@127.0.0.1:5432/blindify")
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).not.toBe("")
    expect(message).not.toContain("motdepasse-secret")
  })
})
