'use client';

import { useEffect, useState } from 'react';
import TrafficChart, { type DailyPoint } from './TrafficChart';

type SearchRow = { query: string; count: number; zeroResultCount: number };
type VendorClickRow = { vendorName: string; vendorSlug: string; clicks: number };
type OfferingClickRow = { testName: string; vendorName: string; clicks: number };
type ViewedTestRow = { test: { id: string; name: string; slug: string }; views: number };
type PageRow = { path: string; views: number };
type ReferrerRow = { referrer: string; clicks: number };

type DailyRow = DailyPoint & { searches: number; clicks: number };

type AnalyticsData = {
  days: number;
  totals: { searches: number; clicks: number; pageViews: number; uniqueVisitors: number };
  daily: DailyRow[];
  topSearches: SearchRow[];
  zeroResultSearches: SearchRow[];
  vendorClicks: VendorClickRow[];
  topOfferingClicks: OfferingClickRow[];
  topViewedTests: ViewedTestRow[];
  topPages: PageRow[];
  topReferrers: ReferrerRow[];
};

const DAY_OPTIONS = [7, 30, 90];
const GA_CONFIGURED = !!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // `stale` guards against a slow older request (e.g. 90d) landing after a newer one (7d) and
    // overwriting it — responses for a superseded `days` value are dropped.
    let stale = false;
    setLoading(true);
    setError(false);
    fetch(`/api/v1/admin/analytics?days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!stale) setData(j.data ?? null);
      })
      .catch(() => {
        if (!stale) setError(true);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [days]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="admin-h1">Analytics</h1>
        <div className="flex gap-1 rounded-lg border border-brand-200 bg-white p-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${days === d ? 'bg-brand-500 text-white' : 'text-brand-600 hover:bg-brand-50'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* GA4 callout — honest about what's NOT here yet: everything below is our own DB (PageView/
          SearchLog/AffiliateClick), which was never built to capture session/device/geo or funnel
          drop-off (opened a suggestion form but didn't submit, used a search suggestion vs typed a
          full query). GA4 now tracks those as custom events (search, search_suggestion_click,
          vendor_click, suggestion_modal_opened, suggestion_submitted — see SKILLS.md), but pulling
          that data back INTO this page needs the GA4 Data API + a service account, which isn't wired
          up yet — for now, this is a link out, not an embed. */}
      {GA_CONFIGURED && (
        <div className="admin-card mb-6 flex items-center justify-between gap-4 p-4">
          <p className="text-sm text-brand-600">
            Session/device/geo and funnel drop-off (search suggestions used, forms opened but not
            submitted) are tracked in Google Analytics now — not shown on this page yet.
          </p>
          <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer" className="admin-btn shrink-0 text-sm">
            Open Google Analytics ↗
          </a>
        </div>
      )}

      {error ? (
        <p className="text-red-600">Couldn&apos;t load analytics — check the server logs and reload.</p>
      ) : loading || !data ? (
        <p className="text-brand-400">Loading…</p>
      ) : (
        <>
          {/* KPI tiles — each with a 12ish-point sparkline of its own daily trend, so a total is never
              just a number with no sense of direction. */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Searches" value={data.totals.searches} series={data.daily.map((d) => d.searches)} />
            <StatTile label="Vendor clicks" value={data.totals.clicks} series={data.daily.map((d) => d.clicks)} />
            <StatTile label="Test page views" value={data.totals.pageViews} series={data.daily.map((d) => d.pageViews)} />
            <StatTile label="Unique visitors" value={data.totals.uniqueVisitors} series={data.daily.map((d) => d.uniqueSessions)} />
          </div>

          {/* Traffic over time — the headline chart; everything else below is a breakdown of it. */}
          <div className="admin-card mb-6 p-5">
            <h2 className="mb-1 text-sm font-semibold text-brand-700">Traffic over time</h2>
            <p className="mb-3 text-xs text-brand-400">Site-wide page views and unique visitors, by day.</p>
            <TrafficChart daily={data.daily} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Zero-result searches — the gap-finding view */}
            <div className="admin-card p-5">
              <h2 className="mb-1 text-sm font-semibold text-brand-700">Searches with no matches</h2>
              <p className="mb-3 text-xs text-brand-400">Consider adding these as tests — people are looking for them and finding nothing.</p>
              <Table
                empty="No zero-result searches in this window."
                rows={data.zeroResultSearches}
                columns={[
                  { header: 'Query', render: (r) => r.query },
                  { header: 'Times', render: (r) => r.zeroResultCount, align: 'right' },
                ]}
              />
            </div>

            {/* Top searches overall */}
            <div className="admin-card p-5">
              <h2 className="mb-1 text-sm font-semibold text-brand-700">Top searches</h2>
              <p className="mb-3 text-xs text-brand-400">What people are typing into the search bar.</p>
              <Table
                empty="No searches in this window."
                rows={data.topSearches}
                columns={[
                  { header: 'Query', render: (r) => r.query },
                  { header: 'Count', render: (r) => r.count, align: 'right' },
                ]}
              />
            </div>

            {/* Top pages — every page, not just test detail pages (home, categories, etc). */}
            <div className="admin-card p-5">
              <h2 className="mb-1 text-sm font-semibold text-brand-700">Top pages</h2>
              <p className="mb-3 text-xs text-brand-400">Every page on the site, by traffic — not just test pages.</p>
              <Table
                empty="No page views in this window."
                rows={data.topPages}
                columns={[
                  { header: 'Path', render: (r) => <span className="font-mono text-xs">{r.path}</span> },
                  { header: 'Views', render: (r) => r.views, align: 'right' },
                ]}
              />
            </div>

            {/* Most-viewed tests */}
            <div className="admin-card p-5">
              <h2 className="mb-1 text-sm font-semibold text-brand-700">Most-viewed tests</h2>
              <p className="mb-3 text-xs text-brand-400">Which test pages get the most traffic.</p>
              <Table
                empty="No test page views in this window."
                rows={data.topViewedTests}
                columns={[
                  { header: 'Test', render: (r) => r.test.name },
                  { header: 'Views', render: (r) => r.views, align: 'right' },
                ]}
              />
            </div>

            {/* Vendor CTR */}
            <div className="admin-card p-5">
              <h2 className="mb-1 text-sm font-semibold text-brand-700">Vendor click-through</h2>
              <p className="mb-3 text-xs text-brand-400">Which "Order" links people click most, across all tests.</p>
              <Table
                empty="No clicks in this window."
                rows={data.vendorClicks}
                columns={[
                  { header: 'Vendor', render: (r) => r.vendorName },
                  { header: 'Clicks', render: (r) => r.clicks, align: 'right' },
                ]}
              />
            </div>

            {/* Referrers — where the traffic that clicks "Order" came from. Logged since day one but
                never surfaced anywhere in admin until now. */}
            <div className="admin-card p-5">
              <h2 className="mb-1 text-sm font-semibold text-brand-700">Top referrers</h2>
              <p className="mb-3 text-xs text-brand-400">Where people were before they clicked an "Order" link.</p>
              <Table
                empty="No referrer data in this window."
                rows={data.topReferrers}
                columns={[
                  { header: 'Source', render: (r) => r.referrer },
                  { header: 'Clicks', render: (r) => r.clicks, align: 'right' },
                ]}
              />
            </div>

            {/* Top test x vendor click pairs (spans 2 cols) */}
            <div className="admin-card p-5 lg:col-span-2">
              <h2 className="mb-1 text-sm font-semibold text-brand-700">Top test → vendor clicks</h2>
              <p className="mb-3 text-xs text-brand-400">Which specific test/vendor combination gets ordered most.</p>
              <Table
                empty="No clicks in this window."
                rows={data.topOfferingClicks}
                columns={[
                  { header: 'Test', render: (r) => r.testName },
                  { header: 'Vendor', render: (r) => r.vendorName },
                  { header: 'Clicks', render: (r) => r.clicks, align: 'right' },
                ]}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Stat tile: label, big value, and a de-emphasized sparkline with the latest point picked out in the
// accent color (dataviz skill's stat-tile contract) — so a KPI is never just a lonely total.
function StatTile({ label, value, series }: { label: string; value: number; series: number[] }) {
  const w = 100;
  const h = 28;
  const max = Math.max(1, ...series);
  const pts = series.map((v, i) => {
    const x = series.length <= 1 ? 0 : (i / (series.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return [x, y] as const;
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];

  return (
    <div className="admin-card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-brand-400">{label}</div>
      <div className="mt-1 text-3xl font-bold text-brand-900">{value.toLocaleString()}</div>
      {series.length > 1 && (
        <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-7 w-full" preserveAspectRatio="none">
          <path d={path} fill="none" stroke="#c3c2b7" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {last && <circle cx={last[0]} cy={last[1]} r={2.2} fill="#2a78d6" />}
        </svg>
      )}
    </div>
  );
}

function Table<T>({ rows, columns, empty }: { rows: T[]; columns: { header: string; render: (r: T) => React.ReactNode; align?: 'left' | 'right' }[]; empty: string }) {
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-brand-400">{empty}</p>;
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-100 text-left text-brand-500">
            {columns.map((c) => (
              <th key={c.header} className={`py-1.5 pr-3 text-xs font-semibold uppercase tracking-wide ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-brand-50">
              {columns.map((c) => (
                <td key={c.header} className={`py-1.5 pr-3 ${c.align === 'right' ? 'text-right font-semibold text-brand-900' : 'text-brand-700'}`}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
