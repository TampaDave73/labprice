import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@labprice/shared', '@labprice/ui', '@labprice/database'],
  // Keep Prisma's generated client external (it ships its own query-engine binary and can't be
  // bundled) — Prisma's recommended Next config, and it silences the Turbopack
  // "@prisma/client can't be external" warnings that otherwise noise up the prod build.
  serverExternalPackages: ['@prisma/client', 'prisma'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
