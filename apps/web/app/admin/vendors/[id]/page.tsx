'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type VendorData = {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  affiliateUrlTemplate: string | null;
  logoUrl: string | null;
  trustLevel: string;
  isActive: boolean;
};

export default function VendorEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const [vendor, setVendor] = useState<VendorData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/admin/vendors/${id}`).then((r) => r.json()).then((j) => setVendor(j.data));
  }, [id]);

  const handleChange = (field: string, value: string | boolean) => {
    setVendor((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  const handleSave = async () => {
    if (!vendor) return;
    setSaving(true);
    await fetch(`/api/v1/admin/vendors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vendor),
    });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this vendor?')) return;
    await fetch(`/api/v1/admin/vendors/${id}`, { method: 'DELETE' });
    router.push('/admin/vendors');
  };

  if (!vendor) return <div className="p-6 text-brand-400">Loading...</div>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-900">Edit Vendor</h1>
      <div className="max-w-2xl space-y-4 rounded-xl border border-brand-100 bg-white p-6 shadow-sm">
        {([
          ['name', 'Name'],
          ['slug', 'Slug'],
          ['websiteUrl', 'Website URL'],
          ['affiliateUrlTemplate', 'Affiliate URL Template'],
          ['logoUrl', 'Logo URL'],
        ] as const).map(([field, label]) => (
          <div key={field}>
            <label className="mb-1 block text-sm font-medium text-brand-700">{label}</label>
            <input type="text" value={(vendor as any)[field] ?? ''} onChange={(e) => handleChange(field, e.target.value)}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        ))}
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-700">Trust Level</label>
          <select value={vendor.trustLevel} onChange={(e) => handleChange('trustLevel', e.target.value)}
            className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="isActive" checked={vendor.isActive} onChange={(e) => handleChange('isActive', e.target.checked)} className="h-4 w-4 rounded" />
          <label htmlFor="isActive" className="text-sm font-medium text-brand-700">Active</label>
        </div>
        <div className="flex gap-3 pt-4">
          <button onClick={handleSave} disabled={saving} className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={handleDelete} className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>
  );
}
