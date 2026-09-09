import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';

// `/search` is disallowed rather than merely noindexed: the page already sets robots:{index:false}
// (app/search/page.tsx), but an unbounded ?q= space would still burn crawl budget being fetched only
// to be discarded. The canonical content is the test pages, which the sitemap lists directly.
const DISALLOW = ['/admin', '/dashboard', '/api', '/auth', '/search'];

export default function robots(): MetadataRoute.Robots {
  return {
    // A single `*` group, deliberately. Per-AI-agent groups were spelled out here as a statement of
    // intent, but they repeated the same Disallow list under each named agent — and audit tools read
    // "named agent + Disallow lines" as "this crawler is blocked", reporting seven AI crawlers as
    // blocked when every one of them was allowed. The `*` group already permits them, so the safest
    // way to say "AI crawlers are welcome" is to say nothing extra.
    rules: [{ userAgent: '*', allow: '/', disallow: DISALLOW }],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
