'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Vendor = {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  trustLevel: string;
  isActive: boolean;
  createdAt: string;
  _count: { offerings: number };
};

export default function VendorsListPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/v1/admin/vendors${qs}`);
      const json = await res.json();
      setVendors(json.data ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-900">Vendors</h1>
      <input type="text" placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />

      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className="p-3">Name</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Website</th>
              <th className="p-3">Trust Level</th>
              <th className="p-3 text-right">Offerings</th>
              <th className="p-3">Active</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-brand-400">Loading...</td></tr>
            ) : vendors.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-brand-400">No vendors found.</td></tr>
            ) : (
              vendors.map((v) => (
                <tr key={v.id} className="border-b border-brand-100 hover:bg-brand-50/50">
                  <td className="p-3"><Link href={`/admin/vendors/${v.id}`} className="font-medium text-brand-900 hover:text-brand-600">{v.name}</Link></td>
                  <td className="p-3 font-mono text-xs text-brand-400">{v.slug}</td>
                  <td className="p-3 text-brand-600 truncate max-w-48">{v.websiteUrl ?? '—'}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    v.trustLevel === 'HIGH' ? 'bg-green-100 text-green-700' :
                    v.trustLevel === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>{v.trustLevel}</span></td>
                  <td className="p-3 text-right text-brand-600">{v._count.offerings}</td>
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
