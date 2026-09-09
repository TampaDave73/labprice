// Headless-browser fetcher for catalog vendors gated behind a Cloudflare/WAF JS challenge that a
// plain `fetch()` can't clear (Request A Test: the homepage loads fine, but `/tests` and every product
// page return Cloudflare's "Just a moment..." interstitial to a bare HTTP client).
//
// WHY this lives in its own module, not `catalog-scraper.ts`/`httpFetchHtml`: `persist.ts` is
// deliberately Playwright-free so it's safe to deep-import into Next.js server code (see its top-of-
// file comment) — every catalog vendor's "Scrape now"/add-test path imports `persist.ts`, so pulling
// Playwright in there would drag a full Chromium into that shared path for every vendor, not just the
// ones that need it. This file is the one narrow exception: the web app's
// `api/v1/admin/vendors/[id]/scrape/route.ts` imports it directly, but ONLY calls it (via
// `adapterNeedsBrowser`, `persist.ts`) for the handful of adapters that actually need it — everyone
// else still goes through plain `httpFetchHtml`. Don't import this from `persist.ts` itself, or from
// anything imported by every route (a shared layout, a widely-used util) — a single dedicated route is
// a contained cost; a shared import point is not.
//
// Only a handful of vendors need this; most catalog vendors work fine with `httpFetchHtml`.
import { chromium } from 'playwright-extra';
// @ts-ignore — no published types for this plugin; whether this actually errors depends on which
// tsconfig resolves it (differs between packages/scrapers and apps/web), so ts-ignore (not
// ts-expect-error) since it mustn't itself error when the import happens to type-check cleanly.
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
      // Cloudflare interstitials take a variable amount of time (worse from datacenter IPs than the
      // fixed 2s we used to wait) — poll until the challenge title clears, then settle briefly.
      try {
        await page.waitForFunction(
          () => !/just a moment|attention required|checking your browser/i.test(document.title),
          { timeout: 15_000 },
        );
      } catch {
        // Challenge never cleared — return what we have; the parser yielding 0 products surfaces it.
      }
      await page.waitForTimeout(1500);
      // XML documents (vendor sitemaps): Chromium renders them inside its XML-viewer DOM, so
      // page.content() would return the viewer wrapper, not the sitemap. The original markup is
      // preserved under this well-known element — return it verbatim when present.
      const xml = await page.evaluate(
        () => document.getElementById('webkit-xml-viewer-source-xml')?.innerHTML ?? null,
      );
      if (xml) return xml;
      // JSON API responses (True Health Labs' Store API needed this 2026-09-09: Cloudflare started
      // 403-ing it from Railway's datacenter IP even though the browser path already used for other
      // vendors clears it fine): Chromium's JSON viewer puts the raw body in a `<pre>` directly under
      // `<body>` — page.content() would return the viewer chrome around it, not the JSON, so
      // parseStoreRows' JSON.parse would silently fail closed (empty array, no error). Unwrap it when
      // present. NOT "the sole child of body" — live DOM has a second, empty `<div>` sibling (found
      // live: `document.body.children` was `[PRE, DIV]`, not just `[PRE]` as first assumed) — so this
      // matches ANY direct `<pre>` child of body whose content looks like JSON, not an exclusive one.
      const json = await page.evaluate(() => {
        for (const child of document.body?.children ?? []) {
          if (child.tagName !== 'PRE') continue;
          const text = child.textContent?.trim() ?? '';
          if (text.startsWith('{') || text.startsWith('[')) return text;
        }
        return null;
      });
      return json ?? (await page.content());
    } finally {
      await context.close();
    }
  };
}
