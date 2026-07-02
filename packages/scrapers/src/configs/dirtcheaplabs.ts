// Dirt Cheap Labs vendor config for the catalog scraper.
//
// dirtcheaplabs.com is an API vendor: its /alacarte page loads the priced catalog from
// api.dirtcheaplabs.com. We fetch both lab catalogs (LabCorp + Quest), each item carrying a lab_code
// + retail_cents, and match by code taking the cheapest lab (mergeCodeTiers).
import type { CatalogScrapeConfig } from '../catalog/catalog-scraper';
import { dirtCheapLabsAdapter } from '../catalog/adapters';

export const DIRTCHEAPLABS_SLUG = 'dirt-cheap-labs';

export const dirtCheapLabsCatalogConfig: CatalogScrapeConfig = {
  baseUrl: 'https://dirtcheaplabs.com',
  catalogPath: '/alacarte',
  apiBase: 'https://api.dirtcheaplabs.com',
  adapter: dirtCheapLabsAdapter,
  matchOptions: {
    includePanels: false,
    flagAmbiguous: true,
    mergeCodeTiers: true, // same test at Quest & LabCorp → take the cheaper lab.
  },
};
