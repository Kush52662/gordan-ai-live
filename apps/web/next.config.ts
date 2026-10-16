import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingExcludes: { '/*': ['./.gordon-data/**/*'] },
  devIndicators: false,
  // Keep verification builds separate from a running development server.
  distDir: process.env.GORDON_NEXT_DIST_DIR || '.next',
};

export default nextConfig;
