// Vendor adapters for the catalog scraper. Each maps a vendor's catalog + product HTML into our
// shared shapes and builds product URLs, so the crawler/matcher/persistence stay vendor-agnostic.
import { parseGoodLabsCatalog, parseGoodLabsProduct } from './goodlabs-parser';
import { parseOwnYourLabsCatalog, parseOwnYourLabsProduct } from './ownyourlabs-parser';
import { fetchDirtCheapLabsCatalog } from './dirtcheaplabs-parser';
import { fetchMitoHealthCatalog } from './mitohealth-parser';
import { parseWalkInLabCatalog, parseWalkInLabProduct, parseWalkInLabNextPage } from './walkinlab-parser';
import { parsePersonalabsCatalog, parsePersonalabsProduct, parsePersonalabsNextPage } from './personalabs-parser';
import { parseHealthLabsCatalog, parseHealthLabsProduct } from './healthlabs-parser';
import { parsePrivateMDLabsCatalog, parsePrivateMDLabsProduct, parsePrivateMDLabsNextPage } from './privatemdlabs-parser';
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

export const mitoHealthAdapter: CatalogAdapter = {
  name: 'mitohealth',
  fetchAll: (deps, cfg) => fetchMitoHealthCatalog(deps, cfg),
};

export const walkInLabAdapter: CatalogAdapter = {
  name: 'walkinlab',
  parseCatalog: (html) => parseWalkInLabCatalog(html),
  parseProduct: (html, baseUrl, slug) => parseWalkInLabProduct(html, baseUrl, slug),
  productUrl: (baseUrl, slug) => `${baseUrl}/products/view/${slug}`,
  nextCatalogPage: (html, currentUrl) => parseWalkInLabNextPage(html, currentUrl),
};

export const personalabsAdapter: CatalogAdapter = {
  name: 'personalabs',
  parseCatalog: (html) => parsePersonalabsCatalog(html),
  parseProduct: (html, baseUrl, slug) => parsePersonalabsProduct(html, baseUrl, slug),
  productUrl: (baseUrl, slug) => `${baseUrl}/product/${slug}/`,
  nextCatalogPage: (html, currentUrl) => parsePersonalabsNextPage(html, currentUrl),
};

export const healthLabsAdapter: CatalogAdapter = {
  name: 'healthlabs',
  parseCatalog: (html) => parseHealthLabsCatalog(html),
  parseProduct: (html, baseUrl, slug) => parseHealthLabsProduct(html, baseUrl, slug),
  productUrl: (baseUrl, slug) => `${baseUrl}/${slug}`,
  // Single flat sitemap.xml fetch — no pagination (nextCatalogPage omitted).
};

export const privateMDLabsAdapter: CatalogAdapter = {
  name: 'privatemdlabs',
  parseCatalog: (html) => parsePrivateMDLabsCatalog(html),
  parseProduct: (html, baseUrl, slug) => parsePrivateMDLabsProduct(html, baseUrl, slug),
  productUrl: (baseUrl, slug) => `${baseUrl}/product/${slug}`,
  nextCatalogPage: (html, currentUrl) => parsePrivateMDLabsNextPage(html, currentUrl),
};

/** Registry keyed by the `adapter` string stored in ScrapeVendorConfig.selectors. */
export const ADAPTERS: Record<string, CatalogAdapter> = {
  goodlabs: goodlabsAdapter,
  ownyourlabs: ownYourLabsAdapter,
  oyl: ownYourLabsAdapter,
  dirtcheaplabs: dirtCheapLabsAdapter,
  dcl: dirtCheapLabsAdapter,
  mitohealth: mitoHealthAdapter,
  walkinlab: walkInLabAdapter,
  personalabs: personalabsAdapter,
  healthlabs: healthLabsAdapter,
  privatemdlabs: privateMDLabsAdapter,
};

export function getAdapter(name: string | undefined | null): CatalogAdapter {
  return (name && ADAPTERS[name]) || goodlabsAdapter;
}
