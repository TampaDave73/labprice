'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type TestData = {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  description: string | null;
  purpose: string | null;
  procedure: string | null;
  preparation: string | null;
  normalRange: string | null;
  questCode: string | null;
  labcorpCode: string | null;
  categoryId: string;
  categoryIds: string[]; // additional categories (beyond the primary)
  isPopular: boolean;
  displayOrder: number;
};

type Category = { id: string; name: string };

const EMPTY: TestData = {
  id: '', name: '', shortName: '', slug: '', description: '', purpose: '', procedure: '',
  preparation: '', normalRange: '', questCode: '', labcorpCode: '', categoryId: '',
  categoryIds: [], isPopular: false, displayOrder: 0,
};

export default function TestEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const [test, setTest] = useState<TestData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isNew = id === 'new';

  useEffect(() => {
    fetch('/api/v1/admin/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? []));
  }, []);

  useEffect(() => {
    if (isNew) { setTest({ ...EMPTY }); return; }
    fetch(`/api/v1/admin/tests/${id}`).then((r) => r.json()).then((j) => {
      const d = j.data;
      // Full category set = m2m memberships ∪ the (legacy) display pointer.
      const ids = Array.from(new Set([d.categoryId, ...(d.categories ?? []).map((c: { categoryId: string }) => c.categoryId)].filter(Boolean)));
      setTest({ ...d, categoryIds: ids });
    });
  }, [id, isNew]);

  const toggleCategory = (catId: string) =>
    setTest((prev) => {
      if (!prev) return prev;
      const has = prev.categoryIds.includes(catId);
      return { ...prev, categoryIds: has ? prev.categoryIds.filter((c) => c !== catId) : [...prev.categoryIds, catId] };
    });

  const handleChange = (field: keyof TestData, value: string | boolean | number) => {
    setTest((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleAddCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    const res = await fetch('/api/v1/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error?.message ?? 'Could not add category'); return; }
    setCategories((prev) => [...prev, json.data]);
    setTest((prev) => (prev ? { ...prev, categoryIds: [...prev.categoryIds, json.data.id] } : prev)); // auto-select new
    setNewCategory('');
    setAddingCategory(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!test) return;
    setError(null);
    if (test.categoryIds.length === 0) { setError('Choose at least one category.'); return; }
    setSaving(true);
    const method = isNew ? 'POST' : 'PATCH';
    const url = isNew ? '/api/v1/admin/tests' : `/api/v1/admin/tests/${id}`;
    const body = {
      name: test.name, shortName: test.shortName, slug: test.slug,
      description: test.description, purpose: test.purpose, procedure: test.procedure,
      preparation: test.preparation, normalRange: test.normalRange,
      questCode: test.questCode, labcorpCode: test.labcorpCode,
      isPopular: test.isPopular, displayOrder: Number(test.displayOrder) || 0,
      categoryIds: test.categoryIds, // full set; server derives the display pointer
    };
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error?.message ?? 'Save failed'); return; }
    router.push('/admin/tests');
  };

  const handleDelete = async () => {
    if (!confirm('Delete this test?')) return;
    await fetch(`/api/v1/admin/tests/${id}`, { method: 'DELETE' });
    router.push('/admin/tests');
  };

  if (!test) return <div className="p-6 text-brand-400">Loading...</div>;

  const labelCls = 'mb-1 block text-sm font-medium text-brand-700';

  return (
    <div>
      <h1 className="admin-h1 mb-6">{isNew ? 'Add Test' : 'Edit Test'}</h1>
      <div className="admin-card max-w-2xl space-y-4 p-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label className={labelCls}>Name</label>
          <input type="text" className="admin-input" value={test.name} onChange={(e) => handleChange('name', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Short Name</label>
          <input type="text" className="admin-input" value={test.shortName} onChange={(e) => handleChange('shortName', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Slug</label>
          <input type="text" className="admin-input" value={test.slug} onChange={(e) => handleChange('slug', e.target.value)} />
        </div>

        {/* Categories — a test belongs to one or many. At least one is required. */}
        <div>
          <label className={labelCls}>Categories <span className="text-red-500">*</span></label>
          {!addingCategory ? (
            <div className="flex flex-wrap items-center gap-2">
              {categories.map((c) => {
                const on = test.categoryIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCategory(c.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      on ? 'border-brand-500 bg-brand-500 text-white' : 'border-brand-200 bg-white text-brand-600 hover:bg-brand-50'
                    }`}
                  >
                    {on ? '✓ ' : ''}{c.name}
                  </button>
                );
              })}
              <button type="button" className="admin-btn admin-btn-sm admin-btn-ghost shrink-0" onClick={() => setAddingCategory(true)}>+ New</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                className="admin-input"
                placeholder="New category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
              />
              <button type="button" className="admin-btn admin-btn-sm shrink-0" onClick={handleAddCategory}>Add</button>
              <button type="button" className="admin-btn admin-btn-sm admin-btn-ghost shrink-0" onClick={() => { setAddingCategory(false); setNewCategory(''); }}>Cancel</button>
            </div>
          )}
          <p className="mt-1 text-xs text-brand-400">Pick one or more. Full list is managed under <span className="font-medium">Categories</span> in the sidebar.</p>
        </div>

        {/* Codes */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Quest Code</label>
            <input type="text" className="admin-input" value={test.questCode ?? ''} onChange={(e) => handleChange('questCode', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>LabCorp Code</label>
            <input type="text" className="admin-input" value={test.labcorpCode ?? ''} onChange={(e) => handleChange('labcorpCode', e.target.value)} />
          </div>
        </div>

        {([
          ['description', 'Description'],
          ['purpose', 'Purpose'],
          ['procedure', "How It's Performed"],
          ['preparation', 'How To Prepare'],
          ['normalRange', 'Normal Ranges'],
        ] as const).map(([field, label]) => (
          <div key={field}>
            <label className={labelCls}>{label}</label>
            <textarea className="admin-input" rows={3} value={(test[field] as string | null) ?? ''} onChange={(e) => handleChange(field, e.target.value)} />
          </div>
        ))}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Display Order</label>
            <input type="number" className="admin-input" value={test.displayOrder} onChange={(e) => handleChange('displayOrder', Number(e.target.value))} />
          </div>
          <div className="flex items-end gap-3 pb-2">
            <input type="checkbox" id="isPopular" className="h-4 w-4 rounded" checked={test.isPopular} onChange={(e) => handleChange('isPopular', e.target.checked)} />
            <label htmlFor="isPopular" className="text-sm font-medium text-brand-700">Popular Test</label>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button onClick={handleSave} disabled={saving} className="admin-btn">
            {saving ? 'Saving...' : 'Save'}
          </button>
          {!isNew && (
            <button onClick={handleDelete} className="admin-btn admin-btn-danger">Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}
