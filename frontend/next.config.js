// Nullish (??), pas ||, pour qu'une chaine VIDE = racine (blindz.app) soit respectee.
// undefined (non defini) -> defaut "/blindify" (ancienne URL). "" -> racine.
const rawBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "/blindify"
const basePath = rawBase === "" ? undefined : rawBase

// Dossier de travail de Next. Le front de DEV (next dev, service systemd) a le
// sien, .next-dev : la construction de prod (next build, en root) ecrit dans
// .next, et un service de dev qui ne tourne plus en root ne pourrait plus y
// ecrire apres elle (infra/menage-2026-10-05). Sans la variable : .next.
const distDir = process.env.NEXT_DIST_DIR || ".next"

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  distDir,
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

module.exports = nextConfig;
