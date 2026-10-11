import { spawnSync } from "child_process"
import path from "path"

// init-db.mjs jouait l'ancien schema (19 tables, aout 2026) avec son propre
// pool, hors du garde-fou, sur le DATABASE_URL de ../.env : celui de la PROD
// quand on le lance dans /opt/blindify/backend. Il ne fait plus rien que
// refuser. Le fichier reste parce que docker-compose.yml le monte.
describe("init-db.mjs", () => {
  it("refuse de s'executer, sans ouvrir aucune connexion", () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, "../../init-db.mjs")], {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "development",
        // Port 9 ferme : une tentative de connexion laisserait ECONNREFUSED.
        DATABASE_URL: "postgres://personne:rien@127.0.0.1:9/blindify",
      },
      encoding: "utf8",
      timeout: 15000,
    })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain("[init-db]")
    expect(r.stderr + r.stdout).not.toMatch(/ECONNREFUSED|Initializing/)
  })
})
