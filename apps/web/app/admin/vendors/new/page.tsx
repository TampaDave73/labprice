'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function NewVendorPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', slug: '', websiteUrl: '', affiliateUrlTemplate: '', logoUrl: '', isActive: true });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: string, value: string | boolean) => setForm((p) => ({ ...p, [field]: value }));

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    const body = { ...form, slug: form.slug || slugify(form.name) };
    const res = await fetch('/api/v1/admin/vendors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error?.message ?? 'Create failed'); return; }
    const json = await res.json();
    router.push(`/admin/vendors/${json.data.id}`);
  };

  const labelCls = 'mb-1 block text-sm font-medium text-brand-700';

  return (
    <div>
      <h1 className="admin-h1 mb-1">Add Vendor</h1>
      <p className="mb-6 text-sm text-brand-400">
        Create the vendor first. Once saved you&rsquo;ll land on its full page to configure the
        <span className="font-medium text-brand-600"> scraper</span>, set the
        <span className="font-medium text-brand-600"> trust</span> rules, and build its
        <span className="font-medium text-brand-600"> catalog</span> of tests — those need the vendor to exist first.
      </p>
      <div className="admin-card max-w-2xl space-y-4 p-6">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div>
          <label className={labelCls}>Name</label>
          <input className="admin-input" value={form.name}
            onChange={(e) => { set('name', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)); }} />
        </div>
        <div>
          <label className={labelCls}>Slug</label>
          <input className="admin-input" value={form.slug}
            onChange={(e) => { setSlugTouched(true); set('slug', e.target.value); }} />
        </div>
        <div>
          <label className={labelCls}>Website URL</label>
          <input className="admin-input" placeholder="https://…" value={form.websiteUrl} onChange={(e) => set('websiteUrl', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Affiliate URL Template</label>
          <input className="admin-input" value={form.affiliateUrlTemplate} onChange={(e) => set('affiliateUrlTemplate', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Logo URL</label>
          <input className="admin-input" value={form.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="isActive" className="h-4 w-4 rounded" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          <label htmlFor="isActive" className="text-sm font-medium text-brand-700">Active</label>
        </div>

        <div className="flex gap-3 pt-4">
          <button onClick={handleSave} disabled={saving} className="admin-btn">{saving ? 'Creating...' : 'Create & Configure'}</button>
          <button onClick={() => router.push('/admin/vendors')} className="admin-btn admin-btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}
