import {
  assertDatabaseTarget,
  checkDatabaseTarget,
  targetDatabaseName,
} from "../../src/config/databaseGuard"

// Adresses d'exemple : le mot de passe ne doit jamais ressortir d'un message.
const PROD_URL = "postgres://blindify:secret-prod@127.0.0.1:5432/blindify"
const DEV_URL = "postgres://blindz_dev:secret-dev@127.0.0.1:5438/blindify_dev"

describe("targetDatabaseName", () => {
  it("lit le nom dans le chemin de l'adresse", () => {
    expect(targetDatabaseName({ nodeEnv: "development", databaseUrl: DEV_URL })).toBe("blindify_dev")
  })

  it("lit ?database= quand le chemin est vide", () => {
    expect(targetDatabaseName({
      nodeEnv: "development",
      databaseUrl: "postgres://u:p@127.0.0.1:5438?database=blindify",
    })).toBe("blindify")
  })

  it("retombe sur l'utilisateur de l'adresse, comme pg, sans nom de base", () => {
    expect(targetDatabaseName({
      nodeEnv: "development",
      databaseUrl: "postgres://blindify:p@127.0.0.1:5432",
    })).toBe("blindify")
  })

  it("prefere PGDATABASE a l'utilisateur quand l'adresse n'a pas de nom", () => {
    expect(targetDatabaseName({
      nodeEnv: "development",
      databaseUrl: "postgres://blindify:p@127.0.0.1:5432",
      pgDatabase: "blindify_dev",
    })).toBe("blindify_dev")
  })

  it("sans DATABASE_URL, lit PGDATABASE puis PGUSER", () => {
    expect(targetDatabaseName({ nodeEnv: undefined, databaseUrl: undefined, pgDatabase: "x" })).toBe("x")
    expect(targetDatabaseName({ nodeEnv: undefined, databaseUrl: undefined, pgUser: "blindify" })).toBe("blindify")
    expect(targetDatabaseName({ nodeEnv: undefined, databaseUrl: undefined })).toBeNull()
  })

  it("decode un nom encode dans l'adresse", () => {
    expect(targetDatabaseName({
      nodeEnv: "development",
      databaseUrl: "postgres://u:p@h:5438/blind%69fy",
    })).toBe("blindify")
  })
})

describe("checkDatabaseTarget", () => {
  it("laisse la prod ouvrir la base de prod", () => {
    expect(checkDatabaseTarget({ nodeEnv: "production", databaseUrl: PROD_URL })).toBeNull()
  })

  it.each(["development", "test", "staging", undefined, ""])(
    "refuse la base de prod quand NODE_ENV vaut %p",
    nodeEnv => {
      const error = checkDatabaseTarget({ nodeEnv, databaseUrl: PROD_URL })
      expect(error).toMatch(/refusee hors production/)
      expect(error).not.toContain("secret-prod")
    },
  )

  it("refuse aussi la base de prod sur un autre hote ou un autre port", () => {
    expect(checkDatabaseTarget({
      nodeEnv: "development",
      databaseUrl: "postgres://u:p@db.example:6543/blindify",
    })).not.toBeNull()
  })

  it("ignore la casse du nom", () => {
    expect(checkDatabaseTarget({
      nodeEnv: "development",
      databaseUrl: "postgres://u:p@h:5438/Blindify",
    })).not.toBeNull()
  })

  it("accepte la base de dev et les bases de test", () => {
    expect(checkDatabaseTarget({ nodeEnv: "development", databaseUrl: DEV_URL })).toBeNull()
    expect(checkDatabaseTarget({
      nodeEnv: "test",
      databaseUrl: "postgres://blindz:blindz@127.0.0.1:5437/blindz_test",
    })).toBeNull()
    // La pile de test tourne en NODE_ENV=production sur blindify_test.
    expect(checkDatabaseTarget({
      nodeEnv: "production",
      databaseUrl: "postgres://blindify:test@127.0.0.1:5436/blindify_test",
    })).toBeNull()
  })

  it("refuse une adresse illisible hors production, sans la recopier", () => {
    const error = checkDatabaseTarget({ nodeEnv: "development", databaseUrl: "pas une adresse secret-x" })
    expect(error).toMatch(/illisible/)
    expect(error).not.toContain("secret-x")
  })

  it("laisse passer l'absence totale de cible (pg echouera seul)", () => {
    expect(checkDatabaseTarget({ nodeEnv: "development", databaseUrl: undefined })).toBeNull()
  })
})

describe("assertDatabaseTarget", () => {
  let exit: jest.SpyInstance
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    exit = jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`)
    }) as never)
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    exit.mockRestore()
    consoleError.mockRestore()
  })

  it("arrete le processus avec le code 1 sur la base de prod hors production", () => {
    expect(() => assertDatabaseTarget({ NODE_ENV: "development", DATABASE_URL: PROD_URL }))
      .toThrow("exit 1")
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[database_guard]"))
    expect(String(consoleError.mock.calls[0][0])).not.toContain("secret-prod")
  })

  it("ne fait rien sur la base de dev", () => {
    assertDatabaseTarget({ NODE_ENV: "development", DATABASE_URL: DEV_URL })
    expect(exit).not.toHaveBeenCalled()
  })

  it("est branche dans config/db : le pool n'est jamais cree sur la base de prod", async () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, DATABASE_URL: process.env.DATABASE_URL }
    const poolCtor = jest.fn()
    jest.resetModules()
    jest.doMock("pg", () => ({ __esModule: true, default: { Pool: poolCtor } }))
    process.env.NODE_ENV = "development"
    process.env.DATABASE_URL = PROD_URL
    try {
      await expect(jest.isolateModulesAsync(async () => { await import("../../src/config/db") }))
        .rejects.toThrow("exit 1")
      expect(poolCtor).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV
      process.env.DATABASE_URL = saved.DATABASE_URL
      jest.dontMock("pg")
      jest.resetModules()
    }
  })
})
