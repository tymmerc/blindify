// Configuration ESLint du backend (creee le 01/10/2026 : avant, `npm run lint`
// echouait faute de configuration). ESLint 10, format "flat", typescript-eslint
// en mode recommande sans verification de types, pour rester rapide en CI.
import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "logs/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Dette mesuree le 01/10/2026 : 102 any (42 dans src/, 60 dans les
      // tests, surtout des simulations). Avertissement plutot qu'erreur, avec
      // un plafond dans `npm run lint` (--max-warnings) : on ne peut plus en
      // ajouter, et chaque any retire fait baisser le plafond.
      "@typescript-eslint/no-explicit-any": "warn",
      // Convention : un nom qui commence par _ est volontairement inutilise
      // (par exemple le 4e argument d'un gestionnaire d'erreur Express).
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  {
    // Script Node lance a la main, ecrit en CommonJS.
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },
)
