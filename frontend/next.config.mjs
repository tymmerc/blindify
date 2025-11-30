const nextConfig = {
  output: "export",
  basePath: "/blindify",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Force a fresh build id on each build to bust cached _next/static assets
  generateBuildId: async () => `${Date.now()}`,
};

export default nextConfig;
