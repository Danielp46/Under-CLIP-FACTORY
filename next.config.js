/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16+: moved out of experimental
  serverExternalPackages: ['fluent-ffmpeg'],

  turbopack: {
    // Explicit project root to avoid lockfile ambiguity warning
    root: __dirname,
  },

  // Large video upload support (handled via streaming, not bodyParser)
  experimental: {},

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'fluent-ffmpeg'];
    }
    return config;
  },
};

module.exports = nextConfig;
