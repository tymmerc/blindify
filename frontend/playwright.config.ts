import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 2,
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
    },
  },
})
