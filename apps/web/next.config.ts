import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // NOT using `output: 'standalone'`: Next's standalone file-tracer drops Prisma's generated client +
  // query engine in this pnpm monorepo, so every DB call fails at runtime. We run a normal `next start`
  // over the full build instead (Dockerfile `web` stage), which keeps @prisma/client and the engine.
  // NOTE: don't add `serverExternalPackages: ['@prisma/client']` here — in this pnpm-hoisted monorepo
  // it conflicts with transpiling `@labprice/database` (which re-exports the client).
  transpilePackages: ['@labprice/shared', '@labprice/ui', '@labprice/database'],

  // Turn OFF streaming metadata, for everyone.
  //
  // Next 15 streams `generateMetadata` output into the body and lets React hoist it into <head>
  // client-side — except for user agents matching `htmlLimitedBots`, which get the metadata resolved
  // into <head> before the first byte. Real search crawlers execute JS and cope fine, but every
  // static HTML reader does not: our audits reported "11 <meta> tags inside <body>" and, worse,
  // "viewport meta tag is missing" (a HIGH finding scored against mobile-first indexing) purely
  // because the tags had not been hoisted yet in the raw HTML.
  //
  // `/.*/` matches every non-empty UA, so metadata is always in <head> as served. The cost is that
  // the shell can't flush until generateMetadata resolves — a handful of milliseconds here, since
  // every generateMetadata on this site is one indexed query the page then reuses.
  htmlLimitedBots: /.*/,

  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
