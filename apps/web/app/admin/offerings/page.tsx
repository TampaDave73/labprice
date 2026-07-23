'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Offering = {
  id: string;
  testId: string;
  testName: string;
  vendorId: string;
  vendorName: string;
  currentPrice: number | null;
  previousPrice: number | null;
  priceUpdatedAt: string | null;
  isActive: boolean;
};

type Option = { id: string; name: string };
type SortKey = 'test' | 'vendor' | 'price' | 'updated';

export default function OfferingsPage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [vendors, setVendors] = useState<Option[]>([]);
  const [tests, setTests] = useState<Option[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [testId, setTestId] = useState('');
  const [sort, setSort] = useState<SortKey>('test');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetch('/api/v1/admin/vendors?sort=name').then((r) => r.json()).then((j) => setVendors((j.data ?? []).map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })))).catch(() => {});
    fetch('/api/v1/admin/tests?sort=name').then((r) => r.json()).then((j) => setTests((j.data ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })))).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ sort, dir });
    if (vendorId) params.set('vendorId', vendorId);
    if (testId) params.set('testId', testId);
    fetch(`/api/v1/admin/offerings?${params.toString()}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error?.message ?? 'Could not load offerings.');
        setOfferings(j.data ?? []);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : 'Could not load offerings — try again.');
        setOfferings([]);
      })
      .finally(() => setLoading(false));
  }, [vendorId, testId, sort, dir, reloadKey]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setDir(key === 'price' || key === 'updated' ? 'desc' : 'asc'); }
  };
  const arrow = (key: SortKey) => (sort === key ? (dir === 'asc' ? ' ↑' : ' ↓') : '');
  const thCls = 'cursor-pointer select-none p-3 hover:text-brand-900';

  return (
    <div>
      <h1 className="admin-h1 mb-1">Offerings</h1>
      <p className="mb-5 text-sm text-brand-400">
        A read-only overview of every test↔vendor price link. Add or remove links from each vendor&rsquo;s <span className="font-medium text-brand-600">Catalog</span> (Vendors → pick a vendor).
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className="admin-input admin-input-inline" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select className="admin-input admin-input-inline" value={testId} onChange={(e) => setTestId(e.target.value)}>
          <option value="">All tests</option>
          {tests.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="text-sm text-brand-400">{offerings.length} link{offerings.length === 1 ? '' : 's'}</span>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className={thCls} onClick={() => toggleSort('test')}>Test{arrow('test')}</th>
              <th className={thCls} onClick={() => toggleSort('vendor')}>Vendor{arrow('vendor')}</th>
              <th className={`${thCls} text-right`} onClick={() => toggleSort('price')}>Current Price{arrow('price')}</th>
              <th className="p-3 text-right">Previous</th>
              <th className={thCls} onClick={() => toggleSort('updated')}>Last Updated{arrow('updated')}</th>
              <th className="p-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-brand-400">Loading...</td></tr>
            ) : loadError ? (
              <tr><td colSpan={6} className="p-6 text-center text-red-600">{loadError} <button className="ml-2 underline" onClick={() => setReloadKey((k) => k + 1)}>Retry</button></td></tr>
            ) : offerings.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-brand-400">No offerings found.</td></tr>
            ) : (
              offerings.map((o) => (
                <tr key={o.id} className="border-b border-brand-100 hover:bg-brand-50/50">
                  <td className="p-3 font-medium text-brand-900">{o.testName}</td>
                  <td className="whitespace-nowrap p-3">
                    <Link href={`/admin/vendors/${o.vendorId}`} className="text-brand-600 hover:text-brand-900 hover:underline">
                      {o.vendorName}
                    </Link>
                  </td>
                  <td className="p-3 text-right font-medium text-brand-900">{o.currentPrice != null ? `$${o.currentPrice.toFixed(2)}` : '—'}</td>
                  <td className="p-3 text-right text-brand-400">{o.previousPrice != null ? `$${o.previousPrice.toFixed(2)}` : '—'}</td>
                  <td className="p-3 text-brand-400">{o.priceUpdatedAt ? new Date(o.priceUpdatedAt).toLocaleDateString() : '—'}</td>
                  <td className="p-3"><span className={`inline-block h-2.5 w-2.5 rounded-full ${o.isActive ? 'bg-success-500' : 'bg-brand-200'}`} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
