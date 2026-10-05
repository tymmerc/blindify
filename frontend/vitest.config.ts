import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // Runtime JSX automatique, comme Next : les composants n'importent pas React,
  // et sans ca les tests de composants (.test.tsx) tombent sur "React is not defined".
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
