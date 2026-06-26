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
  preparation: string | null;
  normalRange: string | null;
  categoryId: string;
  isPopular: boolean;
  displayOrder: number;
  category: { id: string; name: string };
  biomarkers: { biomarker: { id: string; name: string } }[];
};

export default function TestEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const [test, setTest] = useState<TestData | null>(null);
  const [saving, setSaving] = useState(false);
  const isNew = id === 'new';

  useEffect(() => {
    if (isNew) {
      setTest({ id: '', name: '', shortName: '', slug: '', description: '', purpose: '', preparation: '', normalRange: '', categoryId: '', isPopular: false, displayOrder: 0, category: { id: '', name: '' }, biomarkers: [] });
      return;
    }
    fetch(`/api/v1/admin/tests/${id}`).then((r) => r.json()).then((j) => setTest(j.data));
  }, [id, isNew]);

  const handleChange = (field: string, value: string | boolean | number) => {
    setTest((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  const handleSave = async () => {
    if (!test) return;
    setSaving(true);
    const method = isNew ? 'POST' : 'PATCH';
    const url = isNew ? '/api/v1/admin/tests' : `/api/v1/admin/tests/${id}`;
    const { category, biomarkers, ...body } = test;
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (isNew) router.push('/admin/tests');
  };

  const handleDelete = async () => {
    if (!confirm('Delete this test?')) return;
    await fetch(`/api/v1/admin/tests/${id}`, { method: 'DELETE' });
    router.push('/admin/tests');
  };

  if (!test) return <div className="p-6 text-brand-400">Loading...</div>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-900">{isNew ? 'Add Test' : 'Edit Test'}</h1>
      <div className="max-w-2xl space-y-4 rounded-xl border border-brand-100 bg-white p-6 shadow-sm">
        {([
          ['name', 'Name', 'text'],
          ['shortName', 'Short Name', 'text'],
          ['slug', 'Slug', 'text'],
          ['categoryId', 'Category ID', 'text'],
        ] as const).map(([field, label, type]) => (
          <div key={field}>
            <label className="mb-1 block text-sm font-medium text-brand-700">{label}</label>
            <input type={type} value={(test as any)[field] ?? ''} onChange={(e) => handleChange(field, e.target.value)}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        ))}
        {(['description', 'purpose', 'preparation', 'normalRange'] as const).map((field) => (
          <div key={field}>
            <label className="mb-1 block text-sm font-medium text-brand-700 capitalize">{field.replace(/([A-Z])/g, ' $1')}</label>
            <textarea value={(test as any)[field] ?? ''} onChange={(e) => handleChange(field, e.target.value)} rows={3}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <input type="checkbox" id="isPopular" checked={test.isPopular} onChange={(e) => handleChange('isPopular', e.target.checked)} className="h-4 w-4 rounded" />
          <label htmlFor="isPopular" className="text-sm font-medium text-brand-700">Popular Test</label>
        </div>

        {!isNew && test.biomarkers.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-brand-700">Biomarkers</label>
            <div className="flex flex-wrap gap-2">
              {test.biomarkers.map((b) => (
                <span key={b.biomarker.id} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
                  {b.biomarker.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button onClick={handleSave} disabled={saving} className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
          {!isNew && (
            <button onClick={handleDelete} className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700">Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}
