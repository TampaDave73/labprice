// Remote diagnosis tool: browser-fetch any URL from inside the worker container and print what the
// vendor actually served (length, title, first bytes) — for figuring out WAF blocks and challenge
// pages without redeploying. Run:
//   railway ssh --service scrape-worker "cd /app/apps/worker && pnpm exec tsx scripts/debug-fetch.ts <url>"
import '../src/env';
import { browserFetchHtml } from '@labprice/scrapers/src/catalog/browser-fetch';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('usage: debug-fetch.ts <url>');
    process.exit(1);
  }
  const fetchHtml = browserFetchHtml(45_000);
  const body = await fetchHtml(url);
  console.log('LENGTH:', body.length);
  console.log('TITLE:', /<title[^>]*>([^<]*)</i.exec(body)?.[1] ?? '(none)');
  console.log('FIRST 800 CHARS:');
  console.log(body.slice(0, 800));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
