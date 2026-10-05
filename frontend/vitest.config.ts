import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // tsconfig garde "jsx": "preserve" pour Next : les tests de composants
  // (*.test.tsx) ont besoin du JSX compile, runtime automatique de React 17+.
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
