// A crawl producing 0 products has three distinct causes, and `runVendorDiscovery` has now mishandled
// two of them in production:
//   - empty listing        → real failure, and the one WAF blocks actually look like
//   - all details failed   → real failure, but a different bug in a different file
//   - nothing to fetch     → NOT a failure; narrowing found none of the requested tests in the catalog
// The third one failed two vendors on 2026-09-13 (a newly-linked Zinc test attached to 18 vendors; the
// two that don't sell zinc were marked FAILED and docked trust for it).
import { describe, it, expect } from 'vitest';
import { emptyCatalogFailure } from '../catalog/persist';
import { goodlabsAdapter, dirtCheapLabsAdapter } from '../catalog/adapters';

const cfg = { baseUrl: 'https://vendor.test', catalogPath: '/shop', adapter: goodlabsAdapter };
const index = (entries: number, detailsAttempted: number, detailErrors: string[] = []) => ({
  entries: Array.from({ length: entries }, (_, i) => ({ slug: `s${i}` })),
  detailsAttempted,
  detailErrors,
});

describe('emptyCatalogFailure', () => {
  it('is NOT a failure when the listing read fine but narrowing selected no pages to fetch', () => {
    expect(emptyCatalogFailure('Discounted Labs', cfg, index(100, 0))).toBeNull();
  });

  it('fails an empty listing, and points at the listing URL rather than guessing at a block', () => {
    const message = emptyCatalogFailure('Discounted Labs', cfg, index(0, 0));
    expect(message).toContain('LISTING at https://vendor.test/shop parsed 0 entries');
    expect(message).not.toMatch(/likely blocked/i);
  });

  it('fails when every fetched detail page yielded nothing, quoting the first errors', () => {
    const message = emptyCatalogFailure('Discounted Labs', cfg, index(100, 3, ['a: HTTP 403', 'b: HTTP 403', 'c: HTTP 403', 'd: HTTP 403']));
    expect(message).toContain('parsed 100 entries fine');
    expect(message).toContain('all 3 product page(s)');
    expect(message).toContain('First failures: a: HTTP 403; b: HTTP 403; c: HTTP 403');
    expect(message).not.toContain('d: HTTP 403'); // capped at three
  });

  it('describes an API vendor by its endpoint, which has no listing/detail split at all', () => {
    const message = emptyCatalogFailure('Dirt Cheap Labs', { baseUrl: 'https://dcl.test', catalogPath: '/alacarte', apiBase: 'https://api.dcl.test', adapter: dirtCheapLabsAdapter }, index(0, 0));
    expect(message).toContain('API at https://api.dcl.test');
  });
});
