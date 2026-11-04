import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // Runtime JSX automatique, comme Next : les composants n'importent pas React,
  // et sans ca les tests de composants (.test.tsx) tombent sur "React is not defined".
  // Depuis vite 8 (vitest 5), la transformation passe par oxc et non plus esbuild :
  // sans cette option, oxc suit le "jsx": "preserve" du tsconfig de Next et laisse le JSX brut.
  oxc: { jsx: { runtime: "automatic" } },
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
