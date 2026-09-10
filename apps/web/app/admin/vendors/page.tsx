'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type TrustLevel = 'LOW' | 'MEDIUM' | 'HIGH';

type Vendor = {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  effectiveTrust: TrustLevel;
  isActive: boolean;
  createdAt: string;
  _count: { offerings: number };
  offeringsWithUrl: number;
};

type SortKey = 'name' | 'trust' | 'offerings' | 'active';

const TRUST_BADGE: Record<TrustLevel, string> = {
  HIGH: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-red-100 text-red-700',
};

export default function VendorsListPage() {
  // ?sort=trust&dir=asc deep-links from the dashboard's attention cards (low trust / failures first).
  const sp = useSearchParams();
  const initialSort = sp.get('sort');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>(
    initialSort && ['name', 'trust', 'offerings', 'active'].includes(initialSort) ? (initialSort as SortKey) : 'name',
  );
  const [dir, setDir] = useState<'asc' | 'desc'>(sp.get('dir') === 'desc' ? 'desc' : 'asc');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Bulk "scrape all catalog vendors" trigger state — null until clicked, then a result/error line.
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const scrapeAll = async () => {
    if (!confirm('Queue a catalog scrape for every active catalog-mode vendor?')) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const res = await fetch('/api/v1/admin/vendors/scrape-all', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setBulkMsg(json.error?.message ?? 'Bulk scrape failed to queue.');
      } else {
        const { queued, vendors: names, skipped } = json.data as { queued: number; vendors: string[]; skipped?: string[] };
        // Name the skipped vendors explicitly: they're the WAF-blocked ones that only scrape from a
        // residential connection, and silently omitting them is how they go stale unnoticed.
        const tail = skipped?.length
          ? ` Skipped ${skipped.length} "Manual only" vendor${skipped.length === 1 ? '' : 's'} (${skipped.join(', ')}) — Cloudflare blocks these from the cloud; run scrape-blocked-vendors.ps1 from home.`
          : '';
        setBulkMsg(`Queued ${queued} vendor scrape${queued === 1 ? '' : 's'} (${names.join(', ')}) — the worker processes them in the background.${tail}`);
      }
    } catch {
      setBulkMsg('Bulk scrape failed to queue — is the site reachable?');
    } finally {
      setBulkBusy(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({ sort, dir });
        if (search) params.set('search', search);
        const res = await fetch(`/api/v1/admin/vendors?${params.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error?.message ?? 'Could not load vendors.');
        setVendors(json.data ?? []);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Could not load vendors — try again.');
        setVendors([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search, sort, dir, reloadKey]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setDir('asc'); }
  };
  const arrow = (key: SortKey) => (sort === key ? (dir === 'asc' ? ' ↑' : ' ↓') : '');
  const thCls = 'cursor-pointer select-none p-3 hover:text-brand-900';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="admin-h1">Vendors</h1>
        <div className="flex items-center gap-3">
          <button onClick={scrapeAll} disabled={bulkBusy} className="admin-btn" title="Queue a catalog discovery scrape for every active catalog-mode vendor">
            {bulkBusy ? 'Queueing…' : 'Scrape all catalog vendors'}
          </button>
          <Link href="/admin/vendors/new" className="admin-btn">Add Vendor</Link>
        </div>
      </div>

      {bulkMsg && <p className="mb-4 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-700">{bulkMsg}</p>}

      <input type="text" placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)}
        className="admin-input mb-4 max-w-sm" />

      <div className="admin-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className={thCls} onClick={() => toggleSort('name')}>Name{arrow('name')}</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Website</th>
              <th className={thCls} onClick={() => toggleSort('trust')}>Trust{arrow('trust')}</th>
              <th className={`${thCls} text-right`} onClick={() => toggleSort('offerings')} title="Tests with a product URL / total linked. Amber = some are missing a URL and need review.">Tests{arrow('offerings')}</th>
              <th className={thCls} onClick={() => toggleSort('active')}>Active{arrow('active')}</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-brand-400">Loading...</td></tr>
            ) : loadError ? (
              <tr><td colSpan={7} className="p-6 text-center text-red-600">{loadError} <button className="ml-2 underline" onClick={() => setReloadKey((k) => k + 1)}>Retry</button></td></tr>
            ) : vendors.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-brand-400">No vendors found.</td></tr>
            ) : (
              vendors.map((v) => (
                <tr key={v.id} className="border-b border-brand-100 hover:bg-brand-50/50">
                  <td className="p-3"><Link href={`/admin/vendors/${v.id}`} className="font-medium text-brand-900 hover:text-brand-600">{v.name}</Link></td>
                  <td className="p-3 font-mono text-xs text-brand-400">{v.slug}</td>
                  <td className="p-3 text-brand-600 truncate max-w-48">{v.websiteUrl ?? '—'}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TRUST_BADGE[v.effectiveTrust]}`}>{v.effectiveTrust}</span></td>
                  <td className="p-3 text-right">
                    {/* withUrl/total — amber when some linked tests have no product URL (need review). */}
                    {v.offeringsWithUrl < v._count.offerings ? (
                      <span
                        className="font-medium text-amber-600"
                        title={`${v._count.offerings - v.offeringsWithUrl} of ${v._count.offerings} linked test(s) have no product URL — needs review`}
                      >
                        {v.offeringsWithUrl}/{v._count.offerings}
                      </span>
                    ) : (
                      <span className="text-brand-600">{v._count.offerings}</span>
                    )}
                  </td>
                  <td className="p-3"><span className={`inline-block h-2.5 w-2.5 rounded-full ${v.isActive ? 'bg-success-500' : 'bg-brand-200'}`} /></td>
                  <td className="p-3 text-brand-400">{new Date(v.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
