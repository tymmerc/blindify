import { defineConfig } from "@playwright/test"
import { readFileSync } from "fs"

// Secret local (jamais commité) : bypass des rate-limits nginx + backend pour
// les tests. Sans lui, la suite sérielle cascade en 429 (sslh est devant nginx,
// donc tous les clients partagent le bucket 127.0.0.1). Clé lue depuis
// /opt/blindify/.e2e-bypass-key, déclarée dans .env (E2E_BYPASS_KEY) côté backend.
let e2eKey = ""
try {
  e2eKey = readFileSync("/opt/blindify/.e2e-bypass-key", "utf8").trim()
} catch {
  // Clé absente : la suite tourne quand même, mais peut prendre des 429.
}

export default defineConfig({
  testDir: "./e2e",
  // 120s : les tests de partie complete (wizard + import + lobby + rounds reels)
  // depassent 60s quand la machine est chargee en fin de suite serielle.
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: "https://tymmerc.eu/blindify",
    headless: true,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "on",
    video: "retain-on-failure",
    extraHTTPHeaders: {
      Origin: "https://tymmerc.eu",
      ...(e2eKey ? { "X-E2E-Key": e2eKey } : {}),
    },
  },
})
