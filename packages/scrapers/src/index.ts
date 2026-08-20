// Types
export type {
  ScrapeResult,
  ScrapeError,
  VendorConfig,
  IScrapeEngine,
} from './types';

// Engines
export { PlaywrightEngine } from './engines/playwright-engine';
export type { PlaywrightEngineOptions } from './engines/playwright-engine';
export { HttpEngine } from './engines/http-engine';
export type { HttpEngineOptions } from './engines/http-engine';

// Core modules
export { ProxyManager } from './proxy-manager';
export { normalizePrice, detectChange, shouldAutoApprove } from './normalizer';
export type { PriceChange, ApprovalDecision } from './normalizer';

// Vendor configs
export { lifeExtensionConfig } from './configs/life-extension';
export { ultaLabTestsConfig } from './configs/ulta-lab-tests';
export { goodlabsCatalogConfig, GOODLABS_SLUG } from './configs/goodlabs';
export { ownYourLabsCatalogConfig, OWNYOURLABS_SLUG } from './configs/ownyourlabs';
export { dirtCheapLabsCatalogConfig, DIRTCHEAPLABS_SLUG } from './configs/dirtcheaplabs';
export { mitoHealthCatalogConfig, MITOHEALTH_SLUG } from './configs/mitohealth';
export { anabolicInsightsCatalogConfig, ANABOLICINSIGHTS_SLUG } from './configs/anabolicinsights';

// Catalog scraper (search-and-match discovery: catalog → product pages → match by code/name)
export type {
  CatalogEntry,
  CatalogProduct,
  ProviderOffering,
  MatchResult,
  MatchStatus,
  MatchTier,
  MatchCandidate,
  MatchOptions,
  TestKey,
} from './catalog/types';
export { parseGoodLabsCatalog, parseGoodLabsProduct } from './catalog/goodlabs-parser';
export { parseOwnYourLabsCatalog, parseOwnYourLabsProduct } from './catalog/ownyourlabs-parser';
export { mergeDirtCheapLabsCatalog, fetchDirtCheapLabsCatalog } from './catalog/dirtcheaplabs-parser';
export { parseMitoHealthCatalog, fetchMitoHealthCatalog } from './catalog/mitohealth-parser';
export { mergeAnabolicInsightsCatalog, fetchAnabolicInsightsCatalog } from './catalog/anabolicinsights-parser';
export { goodlabsAdapter, ownYourLabsAdapter, dirtCheapLabsAdapter, mitoHealthAdapter, anabolicInsightsAdapter, ADAPTERS, getAdapter } from './catalog/adapters';
export type { CatalogAdapter } from './catalog/types';
export { matchTestToProducts, nameMatches, nameTokens } from './catalog/matcher';
export { decodeNextFlight, extractJsonObject } from './catalog/flight-parser';
export {
  fetchCatalogEntries,
  fetchProduct,
  buildCatalogIndex,
  matchOfferings,
  discover,
  httpFetchHtml,
} from './catalog/catalog-scraper';
export type { CatalogScrapeConfig, FetchDeps, OfferingMatch } from './catalog/catalog-scraper';
