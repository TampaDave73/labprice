'use client';

import { useEffect, useState } from 'react';

type Category = {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  testCount: number;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/v1/admin/categories');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message ?? 'Could not load categories.');
      setCategories(j.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load categories — try again.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const res = await fetch('/api/v1/admin/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error?.message ?? 'Could not add category'); return; }
    setNewName('');
    load();
  };

  const rename = async (id: string, name: string) => {
    const res = await fetch(`/api/v1/admin/categories/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error?.message ?? 'Rename failed'); load(); return; }
    setError(null);
  };

  const reorder = async (id: string, displayOrder: number) => {
    await fetch(`/api/v1/admin/categories/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayOrder }),
    });
  };

  const remove = async (cat: Category) => {
    setError(null); setMsg(null);
    const warn = cat.testCount > 0
      ? `Delete "${cat.name}"? It is used by ${cat.testCount} test(s). Tests that have other categories will keep them; any test left with none will block the delete.`
      : `Delete "${cat.name}"?`;
    if (!confirm(warn)) return;
    const res = await fetch(`/api/v1/admin/categories/${cat.id}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error?.message ?? 'Delete failed'); return; }
    setMsg(`Deleted "${cat.name}"${j.data?.reassigned ? ` (${j.data.reassigned} test(s) reassigned).` : '.'}`);
    load();
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="admin-h1">Categories</h1>
        {msg && <span className="text-sm text-success-700">{msg}</span>}
      </div>
      <p className="mb-5 text-sm text-brand-400">
        Tests can belong to one or many categories. Deleting a category that would leave a test with
        no category is blocked until you reassign those tests.
      </p>

      {error && (
        <div className="mb-4 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error} <button className="underline" onClick={load}>Retry</button>
        </div>
      )}

      {/* Add */}
      <div className="mb-4 flex max-w-md items-center gap-2">
        <input
          className="admin-input"
          placeholder="New category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button onClick={add} disabled={!newName.trim()} className="admin-btn shrink-0">Add</button>
      </div>

      <div className="admin-card max-w-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className="p-3" style={{ width: 80 }}>Order</th>
              <th className="p-3">Name</th>
              <th className="p-3">Slug</th>
              <th className="p-3 text-right">Tests</th>
              <th className="p-3" style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-6 text-center text-brand-400">Loading...</td></tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-brand-400">No categories yet.</td></tr>
            ) : (
              categories.map((c) => (
                <tr key={c.id} className="border-b border-brand-100">
                  <td className="p-2">
                    <input type="number" className="admin-input" style={{ width: 64, padding: '6px 8px' }}
                      defaultValue={c.displayOrder} onBlur={(e) => reorder(c.id, Number(e.target.value))} />
                  </td>
                  <td className="p-2">
                    <input className="admin-input" defaultValue={c.name}
                      onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.name) rename(c.id, e.target.value.trim()); }} />
                  </td>
                  <td className="p-3 font-mono text-xs text-brand-400">{c.slug}</td>
                  <td className="p-3 text-right text-brand-600">{c.testCount}</td>
                  <td className="p-2 text-right">
                    <button onClick={() => remove(c)} className="admin-btn admin-btn-sm admin-btn-danger" title="Delete">✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
