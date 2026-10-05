import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // tsconfig garde jsx "preserve" pour Next ; les tests de composants (.tsx)
  // ont besoin que Vitest transforme le JSX lui-meme.
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
