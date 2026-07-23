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

type VendorRow = {
  vendorId: string;
  vendorName: string;
  offered: boolean;
  offeringId: string | null;
  currentPrice: number | null;
  externalUrl: string | null;
  isActive: boolean;
};

const EMPTY: TestData = {
  id: '', name: '', shortName: '', slug: '', description: '', purpose: '', procedure: '',
  preparation: '', normalRange: '', questCode: '', labcorpCode: '', categoryId: '',
  categoryIds: [], isPopular: false, displayOrder: 0,
};

// Text fields the "auto-fill from name" lookup populates — only when currently blank, so it never
// clobbers something the admin already typed. (Categories are handled separately, as an array.)
const LOOKUP_FIELDS = ['shortName', 'slug', 'questCode', 'labcorpCode', 'description', 'purpose', 'procedure', 'preparation', 'normalRange'] as const;

export default function TestEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const [test, setTest] = useState<TestData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  // Per-field provenance for the two code inputs only — 'dirtcheaplabs' (a live catalog match, not
  // AI) vs 'ai' (Claude's best guess, needs verification). The five content fields never have a
  // vendor-sourced option: they're always Claude's writing, never copied from a vendor page — see the
  // static note below the Auto-fill button.
  const [codeSources, setCodeSources] = useState<{ questCode?: string; labcorpCode?: string }>({});
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [vendorBusy, setVendorBusy] = useState<Set<string>>(new Set());
  // Distinct from `error` (which is action feedback on an already-loaded page): a failure here means
  // `test` never gets set, so without this the page would hang on "Loading..." forever with no way
  // out but a manual reload. `reloadKey` re-runs both load effects for the Try again button.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vendorsError, setVendorsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const isNew = id === 'new';

  useEffect(() => {
    fetch('/api/v1/admin/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? [])).catch(() => {});
  }, [reloadKey]);

  useEffect(() => {
    if (isNew) { setTest({ ...EMPTY }); return; }
    setLoadError(null);
    fetch(`/api/v1/admin/tests/${id}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.data) throw new Error(j.error?.message ?? 'Could not load this test.');
        return j.data;
      })
      .then((d) => {
        // Full category set = m2m memberships ∪ the (legacy) display pointer.
        const ids = Array.from(new Set([d.categoryId, ...(d.categories ?? []).map((c: { categoryId: string }) => c.categoryId)].filter(Boolean)));
        setTest({ ...d, categoryIds: ids });
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load this test — try again.'));

    // Which vendors offer this test (managed inline below). Existing tests only. Failure here doesn't
    // block the page — it just leaves the checklist empty with an inline error, since the test itself
    // is still usable without it.
    setVendorsError(null);
    fetch(`/api/v1/admin/tests/${id}/vendors`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error?.message ?? 'Could not load vendors.');
        setVendors(j.data ?? []);
      })
      .catch((e) => setVendorsError(e instanceof Error ? e.message : 'Could not load vendors — try again.'));
  }, [id, isNew, reloadKey]);

  const toggleCategory = (catId: string) =>
    setTest((prev) => {
      if (!prev) return prev;
      const has = prev.categoryIds.includes(catId);
      return { ...prev, categoryIds: has ? prev.categoryIds.filter((c) => c !== catId) : [...prev.categoryIds, catId] };
    });

  const handleChange = (field: keyof TestData, value: string | boolean | number) => {
    setTest((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  // Auto-fill codes + content from the test name (catalogs first, AI fallback). Fills blanks only.
  const handleLookup = async () => {
    if (!test?.name.trim()) { setError('Enter a test name first.'); return; }
    setError(null);
    setLookupNote(null);
    setLookingUp(true);
    try {
      const res = await fetch('/api/v1/admin/tests/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: test.name }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error?.message ?? 'Lookup failed'); return; }
      const d = j.data ?? {};
      setTest((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        for (const f of LOOKUP_FIELDS) {
          const cur = prev[f];
          const incoming = d[f];
          if ((cur == null || String(cur).trim() === '') && incoming != null && incoming !== '') {
            (next as Record<string, unknown>)[f] = incoming;
          }
        }
        // Categories: only auto-select when none are chosen yet (don't override the admin's picks).
        if (prev.categoryIds.length === 0 && Array.isArray(d.categoryIds) && d.categoryIds.length > 0) {
          next.categoryIds = d.categoryIds;
        }
        return next;
      });
      setCodeSources(d.sources ?? {});
      setLookupNote(Array.isArray(d.notes) && d.notes.length ? d.notes.join(' ') : 'Auto-fill complete.');
    } catch {
      setError('Lookup failed — check your connection and try again.');
    } finally {
      setLookingUp(false);
    }
  };

  // Attach / detach a vendor from the test side. Attaching a catalog vendor auto-scrapes the price.
  const toggleVendor = async (row: VendorRow) => {
    if (vendorBusy.has(row.vendorId)) return;
    setVendorBusy((prev) => new Set(prev).add(row.vendorId));
    try {
      if (row.offered) {
        await fetch(`/api/v1/admin/tests/${id}/vendors?vendorId=${row.vendorId}`, { method: 'DELETE' });
        setVendors((prev) => prev.map((v) => (v.vendorId === row.vendorId
          ? { ...v, offered: false, offeringId: null, currentPrice: null, externalUrl: null } : v)));
      } else {
        const res = await fetch(`/api/v1/admin/tests/${id}/vendors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendorId: row.vendorId }),
        });
        const j = await res.json();
        const d = j.data ?? {};
        setVendors((prev) => prev.map((v) => (v.vendorId === row.vendorId
          ? { ...v, offered: true, offeringId: d.offeringId ?? null, currentPrice: d.currentPrice ?? null, externalUrl: d.externalUrl ?? null } : v)));
      }
    } catch {
      setError('Could not update vendor link — try again.');
    } finally {
      setVendorBusy((prev) => { const n = new Set(prev); n.delete(row.vendorId); return n; });
    }
  };

  // Bulk-toggle: reuses toggleVendor per row (in parallel) rather than duplicating its request/state
  // logic — each row has its own vendorId key in vendorBusy so concurrent calls don't collide.
  const toggleAllVendors = (select: boolean) => {
    vendors.filter((v) => v.offered !== select && !vendorBusy.has(v.vendorId)).forEach((row) => toggleVendor(row));
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

  if (loadError) {
    return (
      <div className="admin-card max-w-2xl p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
        <button className="admin-btn mt-3" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
      </div>
    );
  }
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
          <div className="flex items-center gap-2">
            <input type="text" className="admin-input" value={test.name} onChange={(e) => handleChange('name', e.target.value)} />
            <button
              type="button"
              className="admin-btn admin-btn-ghost shrink-0"
              onClick={handleLookup}
              disabled={lookingUp || !test.name.trim()}
              title="Find Quest/LabCorp codes and generate description, purpose, prep and ranges from the name"
            >
              {lookingUp ? 'Looking up…' : '✨ Auto-fill'}
            </button>
          </div>
          <p className="mt-1 text-xs text-brand-400">
            Auto-fill only fills blanks, never overwrites what you&apos;ve typed. <span className="font-medium text-brand-600">Order codes</span> come
            from a live vendor-catalog match when one exists (flagged below), AI-guessed otherwise. <span className="font-medium text-brand-600">Every
            content field below</span> (description, purpose, procedure, preparation, normal ranges) is written by Claude from the test name —
            it is never copied from a vendor&apos;s page. Review everything before saving either way.
          </p>
          {lookupNote && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{lookupNote}</div>
          )}
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
            {codeSources.questCode === 'ai' && <p className="mt-1 text-xs text-amber-700">⚠ AI-suggested — verify against the lab before saving.</p>}
            {codeSources.questCode && codeSources.questCode !== 'ai' && <p className="mt-1 text-xs text-success-700">✓ Matched in the {codeSources.questCode} catalog, not AI-guessed.</p>}
          </div>
          <div>
            <label className={labelCls}>LabCorp Code</label>
            <input type="text" className="admin-input" value={test.labcorpCode ?? ''} onChange={(e) => handleChange('labcorpCode', e.target.value)} />
            {codeSources.labcorpCode === 'ai' && <p className="mt-1 text-xs text-amber-700">⚠ AI-suggested — verify against the lab before saving.</p>}
            {codeSources.labcorpCode && codeSources.labcorpCode !== 'ai' && <p className="mt-1 text-xs text-success-700">✓ Matched in the {codeSources.labcorpCode} catalog, not AI-guessed.</p>}
          </div>
        </div>

        <p className="text-xs font-medium uppercase tracking-wide text-brand-400">
          Content fields — always AI-written from the test name, never copied from a vendor
        </p>
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

        {/* Vendors — which services offer this test. Attaching a catalog vendor auto-scrapes its price. */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className={labelCls + ' mb-0'}>Vendors</label>
            {!isNew && vendors.length > 1 && (
              <div className="flex gap-2">
                <button type="button" className="text-xs font-medium text-brand-500 hover:text-brand-700" onClick={() => toggleAllVendors(true)}>
                  Select all
                </button>
                <span className="text-xs text-brand-300">·</span>
                <button type="button" className="text-xs font-medium text-brand-500 hover:text-brand-700" onClick={() => toggleAllVendors(false)}>
                  Deselect all
                </button>
              </div>
            )}
          </div>
          {vendorsError && (
            <p className="mb-1 text-xs text-red-600">
              {vendorsError} <button type="button" className="underline" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
            </p>
          )}
          {isNew ? (
            <p className="text-xs text-brand-400">Save the test first, then attach vendors here.</p>
          ) : vendors.length === 0 ? (
            <p className="text-xs text-brand-400">{vendorsError ? '' : 'No vendors yet.'}</p>
          ) : (
            <div className="space-y-1">
              {vendors.map((v) => {
                const busy = vendorBusy.has(v.vendorId);
                return (
                  <label
                    key={v.vendorId}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      v.offered ? 'border-brand-300 bg-brand-50' : 'border-brand-100 bg-white'
                    } ${busy ? 'opacity-60' : 'cursor-pointer hover:bg-brand-50'}`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded"
                        checked={v.offered}
                        disabled={busy}
                        onChange={() => toggleVendor(v)}
                      />
                      <span className="font-medium text-brand-700">{v.vendorName}</span>
                    </span>
                    <span className="text-xs text-brand-500">
                      {busy ? 'Working…' : v.offered ? (v.currentPrice != null ? `$${v.currentPrice.toFixed(2)}` : 'No price yet') : ''}
                    </span>
                  </label>
                );
              })}
              <p className="mt-1 text-xs text-brand-400">Checking a catalog vendor scrapes the current price automatically.</p>
            </div>
          )}
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
