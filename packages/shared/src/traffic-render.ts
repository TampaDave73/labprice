// Renders the weekly traffic topline for the Monday admin digest. Pure — no DB, no network — so the
// formatting is unit-testable; collection lives in apps/worker/src/traffic.ts.
//
// Lives in @labprice/shared (not the worker) only so it can have tests: apps/worker has no test
// runner. Deep-import it; it is not in the index barrel.
import type { Ga4Traffic } from './ga4';

export type TrafficSummary = {
  days: number;
  /** null when GA4 is unconfigured or the API call failed — the digest still sends. */
  ga4: Ga4Traffic | null;
  topSearches: { query: string; count: number; zeroResults: boolean }[];
  zeroResultSearches: { query: string; count: number; zeroResults: boolean }[];
  topTests: { name: string; views: number }[];
  clicksByVendor: { vendor: string; clicks: number }[];
  totalPageViews: number;
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const H2 = 'margin:24px 0 8px;font-size:16px;color:#111827;';
const TD = 'padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#374151;';

function list(title: string, rows: { label: string; value: number | string }[]): string {
  if (rows.length === 0) return '';
  return `<p style="${H2}"><strong>${esc(title)}</strong></p>
    <table style="border-collapse:collapse;width:100%;max-width:520px;font-size:14px;">
      ${rows.map((r) => `<tr><td style="${TD}">${esc(r.label)}</td><td style="${TD}text-align:right;white-space:nowrap;">${esc(String(r.value))}</td></tr>`).join('')}
    </table>`;
}

export function renderTrafficHtml(t: TrafficSummary): string {
  const chip = (n: number | string, label: string) =>
    `<span style="display:inline-block;margin:0 8px 8px 0;padding:6px 14px;border-radius:14px;background:#2563eb18;color:#2563eb;font-weight:600;font-size:13px;">${esc(String(n))} ${esc(label)}</span>`;

  const head = t.ga4
    ? `${chip(t.ga4.users, 'visitors')}${chip(t.ga4.sessions, 'sessions')}${chip(t.totalPageViews, 'page views')}`
    : `${chip(t.totalPageViews, 'page views')}<p style="margin:8px 0;font-size:13px;color:#6b7280;">Google Analytics is not configured for the worker, so visitor and traffic-source figures are unavailable this week. The figures below come from our own database.</p>`;

  return `<h2 style="margin:32px 0 4px;font-size:18px;color:#111827;">Site traffic — last ${t.days} days</h2>
    ${head}
    ${t.ga4 ? list('Where they came from', t.ga4.topSources.map((s) => ({ label: s.source, value: s.sessions }))) : ''}
    ${list('What they searched for', t.topSearches.map((s) => ({ label: s.query, value: s.count })))}
    ${list('Searches with NO results (candidates to add)', t.zeroResultSearches.map((s) => ({ label: s.query, value: s.count })))}
    ${list('Most-viewed tests', t.topTests.map((x) => ({ label: x.name, value: x.views })))}
    ${list('Click-throughs by vendor', t.clicksByVendor.map((c) => ({ label: c.vendor, value: c.clicks })))}`;
}

export function renderTrafficText(t: TrafficSummary): string {
  const section = (title: string, rows: { label: string; value: number | string }[]) =>
    rows.length === 0 ? [] : [``, `${title}:`, ...rows.map((r) => `  ${r.label} — ${r.value}`)];

  return [
    ``,
    `SITE TRAFFIC — LAST ${t.days} DAYS`,
    t.ga4
      ? `${t.ga4.users} visitors · ${t.ga4.sessions} sessions · ${t.totalPageViews} page views`
      : `${t.totalPageViews} page views (Google Analytics not configured for the worker — visitor and source figures unavailable)`,
    ...(t.ga4 ? section('Where they came from', t.ga4.topSources.map((s) => ({ label: s.source, value: s.sessions }))) : []),
    ...section('What they searched for', t.topSearches.map((s) => ({ label: s.query, value: s.count }))),
    ...section('Searches with NO results', t.zeroResultSearches.map((s) => ({ label: s.query, value: s.count }))),
    ...section('Most-viewed tests', t.topTests.map((x) => ({ label: x.name, value: x.views }))),
    ...section('Click-throughs by vendor', t.clicksByVendor.map((c) => ({ label: c.vendor, value: c.clicks }))),
  ].join('\n');
}
