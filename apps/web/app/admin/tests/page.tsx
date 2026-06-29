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

type SortKey = 'name' | 'category' | 'created' | 'popular';

export default function TestsListPage() {
  const [tests, setTests] = useState<Test[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('name');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ sort, dir });
      if (search) params.set('search', search);
      const res = await fetch(`/api/v1/admin/tests?${params.toString()}`);
      const json = await res.json();
      setTests(json.data ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search, sort, dir]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setDir(key === 'created' || key === 'popular' ? 'desc' : 'asc'); }
  };

  const arrow = (key: SortKey) => (sort === key ? (dir === 'asc' ? ' ↑' : ' ↓') : '');
  const thCls = 'cursor-pointer select-none p-3 hover:text-brand-900';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="admin-h1">Tests</h1>
        <Link href="/admin/tests/new" className="admin-btn">
          Add Test
        </Link>
      </div>

      <input
        type="text"
        placeholder="Search tests..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="admin-input mb-4 max-w-sm"
      />

      <div className="admin-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className={thCls} onClick={() => toggleSort('name')}>Name{arrow('name')}</th>
              <th className={thCls} onClick={() => toggleSort('category')}>Category{arrow('category')}</th>
              <th className="p-3">Slug</th>
              <th className="p-3 text-right">Offerings</th>
              <th className={thCls} onClick={() => toggleSort('popular')}>Popular{arrow('popular')}</th>
              <th className={thCls} onClick={() => toggleSort('created')}>Created{arrow('created')}</th>
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
