'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Test = {
  id: string;
  name: string;
  slug: string;
  isPopular: boolean;
  createdAt: string;
  category: { name: string };
  _count: { offerings: number };
};

export default function TestsListPage() {
  const [tests, setTests] = useState<Test[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/v1/admin/tests${qs}`);
      const json = await res.json();
      setTests(json.data ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-900">Tests</h1>
        <Link href="/admin/tests/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Add Test
        </Link>
      </div>

      <input
        type="text"
        placeholder="Search tests..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className="p-3">Name</th>
              <th className="p-3">Category</th>
              <th className="p-3">Slug</th>
              <th className="p-3 text-right">Offerings</th>
              <th className="p-3">Popular</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-brand-400">Loading...</td></tr>
            ) : tests.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-brand-400">No tests found.</td></tr>
            ) : (
              tests.map((t) => (
                <tr key={t.id} className="border-b border-brand-100 hover:bg-brand-50/50">
                  <td className="p-3"><Link href={`/admin/tests/${t.id}`} className="font-medium text-brand-900 hover:text-brand-600">{t.name}</Link></td>
                  <td className="p-3 text-brand-600">{t.category.name}</td>
                  <td className="p-3 font-mono text-xs text-brand-400">{t.slug}</td>
                  <td className="p-3 text-right text-brand-600">{t._count.offerings}</td>
                  <td className="p-3"><span className={`inline-block h-2.5 w-2.5 rounded-full ${t.isPopular ? 'bg-success-500' : 'bg-brand-200'}`} /></td>
                  <td className="p-3 text-brand-400">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
