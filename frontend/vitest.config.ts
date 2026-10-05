import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // Premier test de composant React (EndFeedback.test.tsx) : le tsconfig de
  // Next garde le JSX tel quel ("preserve"), esbuild doit donc le compiler ici,
  // avec le runtime automatique comme Next (sans import React dans chaque fichier).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
})
