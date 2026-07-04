// Headless-browser fetcher for catalog vendors gated behind a Cloudflare/WAF JS challenge that a
// plain `fetch()` can't clear (Request A Test: the homepage loads fine, but `/tests` and every product
// page return Cloudflare's "Just a moment..." interstitial to a bare HTTP client).
//
// WHY this lives in its own module, not `catalog-scraper.ts`/`httpFetchHtml`: `persist.ts` is
// deliberately Playwright-free so it's safe to deep-import into Next.js server code (see its top-of-
// file comment). This file pulls in `playwright-extra` + the stealth plugin, so only import it from
// worker-side scripts, never from `persist.ts` or anything the web app imports — that would drag a full
// Chromium into the Next.js server bundle for every vendor, not just the ones that need it.
//
// Only a handful of vendors need this; most catalog vendors work fine with `httpFetchHtml`.
import { chromium } from 'playwright-extra';
// @ts-expect-error — no published types for this plugin.
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

/**
 * Drop-in replacement for `httpFetchHtml`: same `(url) => Promise<string>` shape, but renders the page
 * in headless Chromium (stealth-patched) so a Cloudflare JS challenge resolves like it would for a real
 * visitor, then returns the fully-rendered HTML. One browser instance is reused across calls within a
 * single crawl (via the returned closure) rather than launching per-request.
 */
export function browserFetchHtml(timeoutMs = 30_000): (url: string) => Promise<string> {
  let browserPromise: ReturnType<typeof chromium.launch> | null = null;
  const getBrowser = () => (browserPromise ??= chromium.launch({ headless: true }));

  return async (url: string) => {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForTimeout(2000); // let the challenge's JS finish and the real page swap in.
      return await page.content();
    } finally {
      await context.close();
    }
  };
}
