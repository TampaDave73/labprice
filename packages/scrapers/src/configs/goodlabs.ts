// GoodLabs vendor config for the catalog scraper.
//
// GoodLabs (goodlabs.com) is a Next.js reseller of Quest/Labcorp/BioReference self-pay tests. It has
// no per-test URL to pre-store and no price API — instead it publishes a catalog (JSON-LD ItemList)
// and per-test pages whose flight data lists every fulfilling lab's code/price/isPanel. So we crawl
// the catalog and match our tests in by code/name rather than fetching one known URL per offering.

import type { CatalogScrapeConfig } from '../catalog/catalog-scraper';

export const GOODLABS_SLUG = 'goodlabs';

export const goodlabsCatalogConfig: CatalogScrapeConfig = {
  baseUrl: 'https://goodlabs.com',
  catalogPath: '/book-tests?step=PANEL_SELECTION',
  rateLimitMs: 800,
  matchOptions: {
    // Try the precise keys first; fall back to name. First tier with a hit wins.
    matchPriority: ['quest', 'labcorp', 'name'],
    // Never price a single test off a bundle panel (Comprehensive Men's, Heart Health, …).
    includePanels: false,
    // Per product owner: when a test resolves to more than one price, flag it — don't guess.
    flagAmbiguous: true,
    // No auto lab preference — leaving this unset keeps multi-price matches in "ambiguous".
  },
};
