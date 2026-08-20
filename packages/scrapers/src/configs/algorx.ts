// AlgoRx vendor config for the catalog scraper.
//
// algorx.com is server-rendered Next.js: the whole priced catalog lives in the /biomarkers page's RSC
// flight payload (one fetch, no pagination, no browser). It publishes NO lab order codes, so matching
// is name-only; its own `type: 'panel'` flag is honored as the isPanel signal. See
// catalog/algorx-parser.ts for the full reasoning.
import type { CatalogScrapeConfig } from '../catalog/catalog-scraper';
import { algoRxAdapter } from '../catalog/adapters';

export const ALGORX_SLUG = 'algorx';

export const algoRxCatalogConfig: CatalogScrapeConfig = {
  baseUrl: 'https://algorx.com',
  catalogPath: '/biomarkers',
  adapter: algoRxAdapter,
  matchOptions: {
    matchPriority: ['name'], // no order codes published anywhere on the site
    includePanels: false,
    // Kept ON deliberately. With no codes there's nothing to corroborate a name match, and loose
    // matches measured against the live catalog are real ("Vitamin D, 25-Hydroxy" → "Vitamin B12").
    // Flagging keeps those out of the public site; genuine matches are promoted by hand in
    // /admin/discovered and then price reliably from their pinned product URL.
    flagAmbiguous: true,
  },
};
