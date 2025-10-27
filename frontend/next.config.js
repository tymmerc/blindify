/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Ignore les erreurs ESLint pendant le build (production uniquement)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Garde la vérification TypeScript mais ignore les erreurs mineures
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig