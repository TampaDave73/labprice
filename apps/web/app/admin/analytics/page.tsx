'use client';

import { useEffect, useState } from 'react';

type SearchRow = { query: string; count: number; zeroResultCount: number };
type VendorClickRow = { vendorName: string; vendorSlug: string; clicks: number };
type OfferingClickRow = { testName: string; vendorName: string; clicks: number };
type ViewedTestRow = { test: { id: string; name: string; slug: string }; views: number };

type AnalyticsData = {
  days: number;
  totals: { searches: number; clicks: number; pageViews: number };
  topSearches: SearchRow[];
  zeroResultSearches: SearchRow[];
  vendorClicks: VendorClickRow[];
  topOfferingClicks: OfferingClickRow[];
  topViewedTests: ViewedTestRow[];
};

const DAY_OPTIONS = [7, 30, 90];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/admin/analytics?days=${days}`)
      .then((r) => r.json())
      .then((j) => setData(j.data ?? null))
      .finally(() => setLoading(false));
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

      {loading || !data ? (
        <p className="text-brand-400">Loading…</p>
      ) : (
        <>
          {/* KPI cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="admin-card p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-brand-400">Searches</div>
              <div className="mt-1 text-3xl font-bold text-brand-900">{data.totals.searches.toLocaleString()}</div>
            </div>
            <div className="admin-card p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-brand-400">Vendor clicks</div>
              <div className="mt-1 text-3xl font-bold text-brand-900">{data.totals.clicks.toLocaleString()}</div>
            </div>
            <div className="admin-card p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-brand-400">Test page views</div>
              <div className="mt-1 text-3xl font-bold text-brand-900">{data.totals.pageViews.toLocaleString()}</div>
            </div>
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
