// Own Your Labs vendor config for the catalog scraper.
//
// ownyourlabs.com is a Phoenix/LiveView reseller. Its /shop page lists every individual test as a
// card linking to /test/<UUID>; each product page carries a single lab ORDER CODE (a Quest or LabCorp
// code) we match against our test's questCode/labcorpCode. Bundles (/bundle/) are excluded.
import type { CatalogScrapeConfig } from '../catalog/catalog-scraper';
import { ownYourLabsAdapter } from '../catalog/adapters';

export const OWNYOURLABS_SLUG = 'own-your-labs';

export const ownYourLabsCatalogConfig: CatalogScrapeConfig = {
  baseUrl: 'https://ownyourlabs.com',
  catalogPath: '/shop',
  adapter: ownYourLabsAdapter,
  rateLimitMs: 500,
  matchOptions: {
    matchPriority: ['quest', 'labcorp', 'name'],
    includePanels: false,
    flagAmbiguous: true,
    // OYL exposes one order code per test (Quest OR LabCorp) without labelling which — match it
    // against both of our codes.
    codeMatchAnyProvider: true,
  },
};
