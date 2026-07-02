// MitoHealth vendor config for the catalog scraper.
//
// mitohealth.com is a $9/mo membership longevity vendor. Its /shop catalog loads from a tRPC API that
// returns per-provider variants with BOTH member and non-member prices (in cents). No lab codes, so
// matching is name-only. We compare on the non-member price and surface the member price as a note.
import type { CatalogScrapeConfig } from '../catalog/catalog-scraper';
import { mitoHealthAdapter } from '../catalog/adapters';

export const MITOHEALTH_SLUG = 'mito-health';

export const mitoHealthCatalogConfig: CatalogScrapeConfig = {
  baseUrl: 'https://mitohealth.com',
  catalogPath: '/shop',
  apiBase: 'https://trpc-bdhnb7m5vq-uc.a.run.app',
  adapter: mitoHealthAdapter,
  matchOptions: {
    matchPriority: ['name'], // no codes — name matching only
    includePanels: false,
    flagAmbiguous: true,
  },
};
