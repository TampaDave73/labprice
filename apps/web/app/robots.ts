import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';

// `/search` is disallowed rather than merely noindexed: the page already sets robots:{index:false}
// (app/search/page.tsx), but an unbounded ?q= space would still burn crawl budget being fetched only
// to be discarded. The canonical content is the test pages, which the sitemap lists directly.
const DISALLOW = ['/admin', '/dashboard', '/api', '/auth', '/search'];

// Redundant with the `*` rule above them — every one of these is already allowed. They're spelled
// out as a statement of intent: this site WANTS to be cited by answer engines, so a future
// tightening of the wildcard rule has to opt them out deliberately rather than by accident.
const AI_AGENTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
  'Amazonbot',
  'meta-externalagent',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      { userAgent: AI_AGENTS, allow: '/', disallow: DISALLOW },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
