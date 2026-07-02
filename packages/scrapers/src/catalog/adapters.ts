// Vendor adapters for the catalog scraper. Each maps a vendor's catalog + product HTML into our
// shared shapes and builds product URLs, so the crawler/matcher/persistence stay vendor-agnostic.
import { parseGoodLabsCatalog, parseGoodLabsProduct } from './goodlabs-parser';
import { parseOwnYourLabsCatalog, parseOwnYourLabsProduct } from './ownyourlabs-parser';
import { fetchDirtCheapLabsCatalog } from './dirtcheaplabs-parser';
import type { CatalogAdapter } from './types';

export const goodlabsAdapter: CatalogAdapter = {
  name: 'goodlabs',
  parseCatalog: (html) => parseGoodLabsCatalog(html),
  parseProduct: (html, baseUrl) => parseGoodLabsProduct(html, baseUrl),
  productUrl: (baseUrl, slug) => `${baseUrl}/tests/${slug}`,
};

export const ownYourLabsAdapter: CatalogAdapter = {
  name: 'ownyourlabs',
  parseCatalog: (html) => parseOwnYourLabsCatalog(html),
  parseProduct: (html, baseUrl, slug) => parseOwnYourLabsProduct(html, baseUrl, slug),
  productUrl: (baseUrl, slug) => `${baseUrl}/test/${slug}`,
};

export const dirtCheapLabsAdapter: CatalogAdapter = {
  name: 'dirtcheaplabs',
  fetchAll: (deps, cfg) => fetchDirtCheapLabsCatalog(deps, cfg),
};

/** Registry keyed by the `adapter` string stored in ScrapeVendorConfig.selectors. */
export const ADAPTERS: Record<string, CatalogAdapter> = {
  goodlabs: goodlabsAdapter,
  ownyourlabs: ownYourLabsAdapter,
  oyl: ownYourLabsAdapter,
  dirtcheaplabs: dirtCheapLabsAdapter,
  dcl: dirtCheapLabsAdapter,
};

export function getAdapter(name: string | undefined | null): CatalogAdapter {
  return (name && ADAPTERS[name]) || goodlabsAdapter;
}
