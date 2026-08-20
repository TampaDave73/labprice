// Anabolic Insights vendor config for the catalog scraper.
//
// anabolicinsights.ai is an API vendor: /labs/panels/biomarkers is a client-rendered shell (no prices
// in its server HTML), and the priced catalog comes from one public JSON endpoint on api.
// anabolicinsights.ai. Each biomarker is priced at up to three labs (Quest/LabCorp/Bioreference) with
// per-lab order codes, so we match by code taking the cheapest lab (mergeCodeTiers).
import type { CatalogScrapeConfig } from '../catalog/catalog-scraper';
import { anabolicInsightsAdapter } from '../catalog/adapters';

export const ANABOLICINSIGHTS_SLUG = 'anabolic-insights';

export const anabolicInsightsCatalogConfig: CatalogScrapeConfig = {
  baseUrl: 'https://www.anabolicinsights.ai',
  catalogPath: '/labs/panels/biomarkers',
  apiBase: 'https://api.anabolicinsights.ai',
  adapter: anabolicInsightsAdapter,
  matchOptions: {
    includePanels: false,
    flagAmbiguous: true,
    mergeCodeTiers: true, // same test at Quest/LabCorp/Bioreference → take the cheaper lab.
  },
};
