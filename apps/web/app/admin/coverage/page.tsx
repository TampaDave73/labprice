'use client';

// /admin/coverage — the tests × vendors matrix. Green = listed with price; amber = the scraper
// found this test at that vendor but no offering exists yet (go list it at /admin/discovered);
// blank = not carried as far as we know.
import Link from 'next/link';
import { useEffect, useState } from 'react';

type Cell = { s: 'listed'; price: string | null } | { s: 'found' };
type Data = {
  vendors: { id: string; name: string }[];
  tests: { id: string; name: string; slug: string }[];
  cells: Record<string, Cell>;
};

export default function CoveragePage() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    fetch('/api/v1/admin/coverage').then((r) => r.json()).then((j) => setData(j.data ?? null));
  }, []);

  if (!data) return <div className="admin-card p-6 text-center text-brand-400">Loading…</div>;

  const gaps = Object.values(data.cells).filter((c) => c.s === 'found').length;

  return (
    <div>
      <h1 className="admin-h1 mb-2">Coverage</h1>
      <p className="mb-4 text-sm text-brand-400">
        {data.tests.length} tests × {data.vendors.length} vendors.{' '}
        <span className="text-brand-600">Green = listed with price.</span>{' '}
        <span className="text-amber-600">Amber = vendor sells it, not listed yet</span>
        {gaps > 0 && <> ({gaps} gap{gaps === 1 ? '' : 's'} — <Link href="/admin/discovered" className="underline">review in Discovered</Link>)</>}.
      </p>

      <div className="admin-card overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr className="bg-brand-50 text-left text-brand-600">
              <th className="sticky left-0 z-10 border-b border-brand-100 bg-brand-50 p-2">Test</th>
              {data.vendors.map((v) => (
                <th key={v.id} className="border-b border-brand-100 p-2 text-center align-bottom">
                  <span className="inline-block max-w-20 truncate" title={v.name}>{v.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.tests.map((t) => (
              <tr key={t.id} className="hover:bg-brand-50/50">
                <td className="sticky left-0 z-10 border-b border-brand-50 bg-white p-2 font-medium text-brand-900">
                  <Link href={`/admin/tests/${t.id}`} className="hover:text-brand-600">{t.name}</Link>
                </td>
                {data.vendors.map((v) => {
                  const cell = data.cells[`${t.id}:${v.id}`];
                  return (
                    <td key={v.id} className="border-b border-brand-50 p-2 text-center">
                      {cell?.s === 'listed' ? (
                        <span className="font-medium text-success-700" title="Listed">{cell.price != null ? `$${Number(cell.price).toFixed(0)}` : '✓'}</span>
                      ) : cell?.s === 'found' ? (
                        <span className="font-medium text-amber-600" title="Vendor sells it — not listed yet (see Discovered)">●</span>
                      ) : (
                        <span className="text-brand-200">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
