import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // NOTE: don't add `serverExternalPackages: ['@prisma/client']` here — in this pnpm-hoisted monorepo
  // it conflicts with transpiling `@labprice/database` (which re-exports the client) and produces
  // "can't be external / could not be resolved" errors. The benign Turbopack "@prisma/client can't be
  // external" *warning* is preferable; a real prod-build fix needs the client resolvable from apps/web.
  transpilePackages: ['@labprice/shared', '@labprice/ui', '@labprice/database'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
