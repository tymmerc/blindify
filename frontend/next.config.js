// Nullish (??), pas ||, pour qu'une chaine VIDE = racine (blindz.app) soit respectee.
// undefined (non defini) -> defaut "/blindify" (ancienne URL). "" -> racine.
const rawBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "/blindify"
const basePath = rawBase === "" ? undefined : rawBase

/** @type {import('next').NextConfig} */
const nextConfig = {
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

module.exports = nextConfig;
