// A vendor scrapes in "catalog mode" (crawl the catalog + match our tests by code/name) rather than
// per-URL when its ScrapeVendorConfig.selectors.mode === 'catalog'. Kept dependency-free so route
// handlers can import it without pulling BullMQ/Redis.
export function isCatalogMode(selectors: unknown): boolean {
  return !!selectors && typeof selectors === 'object' && (selectors as Record<string, unknown>).mode === 'catalog';
}
