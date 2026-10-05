// Nullish (??), pas ||, pour qu'une chaine VIDE = racine (blindz.app) soit respectee.
// undefined (non defini) -> defaut "/blindify" (ancienne URL). "" -> racine.
const rawBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "/blindify"
const basePath = rawBase === "" ? undefined : rawBase

// Valeur de PHASE_DEVELOPMENT_SERVER dans next/constants : la phase de next dev
// (ecrite ici en clair, le lint du front refuse require()).
const PHASE_DEVELOPMENT_SERVER = "phase-development-server"

// Dossier de travail de Next. Le front de DEV (next dev, service systemd) a le
// sien, .next-dev : la construction de prod (next build, en root) ecrit dans
// .next, et un service de dev qui ne tourne plus en root ne pourrait plus y
// ecrire apres elle (infra/menage-2026-10-05).
// NEXT_DIST_DIR n'est lu QUE par next dev. Avec output "export", un distDir
// autre que ".next" devient le dossier de l'export (next/dist/export/utils.js,
// hasCustomExportOutput) : une variable oubliee dans le shell d'une mise en
// prod enverrait le site dans .next-dev au lieu de out/, que nginx sert.
function distDirFor(phase) {
  return phase === PHASE_DEVELOPMENT_SERVER ? process.env.NEXT_DIST_DIR || ".next" : ".next"
}

/** @type {import('next').NextConfig} */
const baseConfig = {
  output: "export",
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  generateBuildId: () => null,
  turbopack: {},
  webpack: (config, { dev }) => {
    // Avoid eval-based source maps so strict CSP policies work in dev too
    if (dev) {
      config.devtool = "cheap-module-source-map";
    }
    return config;
  },
};

module.exports = (phase) => ({ ...baseConfig, distDir: distDirFor(phase) });
