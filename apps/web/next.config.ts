import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // NOT using `output: 'standalone'`: Next's standalone file-tracer drops Prisma's generated client +
  // query engine in this pnpm monorepo, so every DB call fails at runtime. We run a normal `next start`
  // over the full build instead (Dockerfile `web` stage), which keeps @prisma/client and the engine.
  // NOTE: don't add `serverExternalPackages: ['@prisma/client']` here — in this pnpm-hoisted monorepo
  // it conflicts with transpiling `@labprice/database` (which re-exports the client).
  transpilePackages: ['@labprice/shared', '@labprice/ui', '@labprice/database'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
