import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@labprice/shared', '@labprice/ui', '@labprice/database'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
