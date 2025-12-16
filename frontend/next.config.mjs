const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/blindify"

const nextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Force a fresh build id on each build to bust cached _next/static assets
  generateBuildId: async () => `${Date.now()}`,
  webpack: (config, { dev }) => {
    // Avoid eval-based source maps so strict CSP policies work in dev too
    if (dev) {
      config.devtool = "cheap-module-source-map";
    }
    return config;
  },
};

export default nextConfig;
