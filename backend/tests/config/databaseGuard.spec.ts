import {
  assertConnectedDatabase,
  assertDatabaseTarget,
  checkDatabaseName,
  checkDatabaseTarget,
  GUARD_EXIT_CODE,
  targetDatabaseName,
} from "../../src/config/databaseGuard"

// Adresses d'exemple : le mot de passe ne doit jamais ressortir d'un message.
const PROD_URL = "postgres://blindify:secret-prod@127.0.0.1:5432/blindify"
const DEV_URL = "postgres://blindz_dev:secret-dev@127.0.0.1:5438/blindify_dev"

// Le nom est lu par pg lui-meme (pg/lib/connection-parameters), qui consulte
// aussi PGDATABASE, PGUSER et USER : on les fixe pour chaque test.
const PG_ENV = ["PGDATABASE", "PGUSER", "USER"] as const
let savedEnv: Record<string, string | undefined>
beforeEach(() => {
  savedEnv = Object.fromEntries(PG_ENV.map(k => [k, process.env[k]]))
  for (const k of PG_ENV) delete process.env[k]
  process.env.USER = "essai"
})
afterEach(() => {
  for (const k of PG_ENV) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe("targetDatabaseName (lecture de pg)", () => {
  it("lit le nom dans le chemin de l'adresse", () => {
    expect(targetDatabaseName(DEV_URL)).toBe("blindify_dev")
  })

  it("ignore ?database= comme pg : sans chemin, c'est l'utilisateur de l'adresse", () => {
    expect(targetDatabaseName("postgres://blindify:p@127.0.0.1:5432?database=blindify_dev")).toBe("blindify")
  })

  it("applique ?user= comme pg : il remplace l'utilisateur, donc le nom par defaut", () => {
    expect(targetDatabaseName("postgres://dev:p@127.0.0.1:5432/?user=blindify")).toBe("blindify")
  })

  it("lit db= d'une adresse socket:", () => {
    expect(targetDatabaseName("socket:/var/run/postgresql?db=blindify")).toBe("blindify")
  })

  it("decode un nom encode dans l'adresse", () => {
    expect(targetDatabaseName("postgres://u:p@h:5438/blind%69fy")).toBe("blindify")
  })

  // USER, lui, est lu une seule fois par pg au chargement (pg/lib/defaults) :
  // le dernier recours, quand ni adresse ni PG* ne donnent de nom.
  it("sans adresse, prend PGDATABASE, puis PGUSER", () => {
    process.env.PGDATABASE = "x"
    expect(targetDatabaseName(undefined)).toBe("x")
    delete process.env.PGDATABASE
    process.env.PGUSER = "blindify"
    expect(targetDatabaseName(undefined)).toBe("blindify")
  })

  it("rend le nom brut quand pg le prend tel quel (%zz n'est pas decode)", () => {
    expect(targetDatabaseName("postgres://u:p@h:5438/%zz")).toBe("%zz")
  })

  it("rend null sur une adresse que pg ne sait pas lire", () => {
    expect(targetDatabaseName("postgres://u:p@h:abc/blindify_dev")).toBeNull()
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

  it.each([
    "postgres://blindify:secret-prod@127.0.0.1:5432?database=blindify_dev",
    "postgres://dev:secret-prod@127.0.0.1:5432/?user=blindify",
    "socket:/var/run/postgresql?db=blindify",
    "postgres://u:secret-prod@db.example:6543/Blindify",
  ])("refuse les adresses ou pg ouvrirait la base de prod : %s", url => {
    const error = checkDatabaseTarget({ nodeEnv: "development", databaseUrl: url })
    expect(error).not.toBeNull()
    expect(error).not.toContain("secret-prod")
  })

  it("refuse l'absence d'adresse quand PGUSER vaut blindify", () => {
    process.env.PGUSER = "blindify"
    expect(checkDatabaseTarget({ nodeEnv: "development", databaseUrl: undefined })).not.toBeNull()
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
    const error = checkDatabaseTarget({ nodeEnv: "development", databaseUrl: "postgres://u:secret-x@h:abc/x" })
    expect(error).toMatch(/illisible/)
    expect(error).not.toContain("secret-x")
  })
})

describe("checkDatabaseName (reponse du serveur)", () => {
  it("refuse blindify hors production, quelle que soit la casse", () => {
    expect(checkDatabaseName("development", "blindify")).toMatch(/refusee hors production/)
    expect(checkDatabaseName(undefined, "BLINDIFY")).not.toBeNull()
  })

  it("laisse passer la prod et les autres bases", () => {
    expect(checkDatabaseName("production", "blindify")).toBeNull()
    expect(checkDatabaseName("development", "blindify_dev")).toBeNull()
  })
})

describe("arrets du processus", () => {
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

  it("sort avec un code propre au garde-fou (78, EX_CONFIG), que systemd ne relance pas", () => {
    expect(GUARD_EXIT_CODE).toBe(78)
    expect(() => assertDatabaseTarget({ NODE_ENV: "development", DATABASE_URL: PROD_URL }))
      .toThrow("exit 78")
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[database_guard]"))
    expect(String(consoleError.mock.calls[0][0])).not.toContain("secret-prod")
  })

  it("ne fait rien sur la base de dev", () => {
    assertDatabaseTarget({ NODE_ENV: "development", DATABASE_URL: DEV_URL })
    expect(exit).not.toHaveBeenCalled()
  })

  it("arrete aussi quand le serveur repond current_database() = blindify", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ db: "blindify" }] })
    await expect(assertConnectedDatabase({ query }, { NODE_ENV: "development" })).rejects.toThrow("exit 78")
    expect(query).toHaveBeenCalledWith("SELECT current_database() AS db")
  })

  it("laisse continuer quand le serveur repond blindify_dev", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ db: "blindify_dev" }] })
    await assertConnectedDatabase({ query }, { NODE_ENV: "development" })
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
        .rejects.toThrow("exit 78")
      expect(poolCtor).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV
      process.env.DATABASE_URL = saved.DATABASE_URL
      jest.dontMock("pg")
      jest.resetModules()
    }
  })
})
