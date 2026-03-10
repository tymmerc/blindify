const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/blindify"

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath,
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
