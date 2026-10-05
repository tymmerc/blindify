import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // tsconfig garde "jsx": "preserve" pour Next : sans ca, esbuild compilerait le
  // JSX des tests .tsx en React.createElement (React non importe).
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
