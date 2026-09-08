import { describe, expect, it } from 'vitest';
import { renderTrafficHtml, renderTrafficText, type TrafficSummary } from '../traffic-render';

const base: TrafficSummary = {
  days: 7,
  ga4: { users: 412, sessions: 588, topSources: [{ source: 'Organic Search', sessions: 300 }] },
  topSearches: [{ query: 'testosterone', count: 40, zeroResults: false }],
  zeroResultSearches: [{ query: 'nad+ test', count: 6, zeroResults: true }],
  topTests: [{ name: 'Testosterone, Total', views: 120 }],
  clicksByVendor: [{ vendor: 'Walk-In Lab', clicks: 33 }],
  totalPageViews: 940,
};

describe('renderTrafficHtml', () => {
  it('includes the headline GA4 numbers', () => {
    const html = renderTrafficHtml(base);
    expect(html).toContain('412');
    expect(html).toContain('Organic Search');
  });

  it('renders the DB half when GA4 is unavailable, and says so', () => {
    const html = renderTrafficHtml({ ...base, ga4: null });
    // The digest must still be useful when Google does not answer.
    expect(html).toContain('Walk-In Lab');
    expect(html).toContain('testosterone');
    expect(html).toMatch(/not configured|unavailable/i);
  });

  it('surfaces zero-result searches — the demand signal for what to add next', () => {
    expect(renderTrafficHtml(base)).toContain('nad+ test');
  });

  it('escapes HTML in search queries so a crafted query cannot inject markup', () => {
    const html = renderTrafficHtml({
      ...base,
      topSearches: [{ query: '<img src=x onerror=alert(1)>', count: 1, zeroResults: false }],
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('renderTrafficText', () => {
  it('produces a plain-text fallback with no markup', () => {
    const text = renderTrafficText(base);
    expect(text).toContain('412');
    expect(text).not.toContain('<');
  });

  it('does not crash on a completely empty week', () => {
    const empty: TrafficSummary = {
      days: 7, ga4: null, topSearches: [], zeroResultSearches: [],
      topTests: [], clicksByVendor: [], totalPageViews: 0,
    };
    expect(() => renderTrafficText(empty)).not.toThrow();
    expect(() => renderTrafficHtml(empty)).not.toThrow();
  });
});
