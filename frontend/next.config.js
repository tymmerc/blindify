// Nullish (??), pas ||, pour qu'une chaine VIDE = racine (blindz.app) soit respectee.
// undefined (non defini) -> defaut "/blindify" (ancienne URL). "" -> racine.
const rawBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "/blindify"
const basePath = rawBase === "" ? undefined : rawBase

// Commit du build, joint aux retours de fin de partie (lib/feedback.ts) pour
// savoir si un bug signale vient d'une version deja corrigee. Hors d'un depot
// git (ou sans git), chaine vide : le front n'envoie alors pas de version.
function buildCommit() {
  try {
    // Fichier CommonJS lu par Next : require est la seule forme possible ici.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("child_process")
      .execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
  } catch {
    return ""
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  generateBuildId: () => null,
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || buildCommit(),
  },
  turbopack: {},
  webpack: (config, { dev }) => {
    // Avoid eval-based source maps so strict CSP policies work in dev too
    if (dev) {
      config.devtool = "cheap-module-source-map";
    }
    return config;
  },
};

module.exports = nextConfig;
