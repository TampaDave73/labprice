// Guards the one piece of adapter wiring that has silently broken twice: the list of adapters the
// admin UI offers drifting away from the adapters that actually exist. `getAdapter()` falls back to
// GoodLabs for an unknown name, so neither direction of drift throws — it just crawls the wrong site
// (a name with no adapter) or hides a working scraper (an adapter with no name).
import { describe, it, expect } from 'vitest';
import { CATALOG_ADAPTERS } from '@labprice/shared';
import { CANONICAL_ADAPTERS, ADAPTER_ALIASES, ADAPTERS, getAdapter } from '../catalog/adapters';

describe('catalog adapter registry', () => {
  it('offers exactly the adapters that exist', () => {
    expect([...CATALOG_ADAPTERS].map((a) => a.name).sort()).toEqual(Object.keys(CANONICAL_ADAPTERS).sort());
  });

  it('resolves every offered name to its own adapter, never the GoodLabs fallback', () => {
    for (const { name } of CATALOG_ADAPTERS) {
      expect(getAdapter(name).name, `adapter "${name}" fell back to GoodLabs`).toBe(name);
    }
  });

  it('points every legacy alias at a canonical adapter', () => {
    for (const [alias, target] of Object.entries(ADAPTER_ALIASES)) {
      expect(CANONICAL_ADAPTERS[target], `alias "${alias}" targets unknown adapter "${target}"`).toBeDefined();
      expect(ADAPTERS[alias]).toBe(CANONICAL_ADAPTERS[target]);
    }
  });

  it('keeps each adapter either page-based or fetchAll, never neither', () => {
    for (const [name, adapter] of Object.entries(CANONICAL_ADAPTERS)) {
      const pageBased = Boolean(adapter.parseCatalog && adapter.parseProduct && adapter.productUrl);
      expect(pageBased || Boolean(adapter.fetchAll), `adapter "${name}" can neither crawl nor fetchAll`).toBe(true);
    }
  });
});
