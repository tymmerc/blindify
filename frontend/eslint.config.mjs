import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Les textes sont en francais : l'apostrophe est du texte, React l'affiche
      // telle quelle. On garde l'interdiction de >, " et }, qui trahissent une
      // vraie faute de frappe dans le JSX.
      "react/no-unescaped-entities": ["error", { forbid: [">", "\"", "}"] }],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "**/next-env.d.ts",
      // Hors git, presents seulement sur le serveur : sans ces lignes, le lint
      // local comptait 3 794 problemes de plus que la CI.
      ".node/**",
      "out_backup/**",
      "test-build.*",
      // Serveur "standalone" genere par Next en janvier 2026 sur une autre
      // machine, jamais utilise par l'export statique : ce n'est pas notre code.
      "server.js",
    ],
  },
];

export default eslintConfig;
