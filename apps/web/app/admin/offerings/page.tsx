'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Offering = {
  id: string;
  testId: string;
  testName: string;
  vendorId: string;
  vendorName: string;
  currentPrice: number | null;
  previousPrice: number | null;
  priceUpdatedAt: string | null;
  isActive: boolean;
};

type Option = { id: string; name: string };
type SortKey = 'test' | 'vendor' | 'price' | 'updated';

// Shape of /api/v1/admin/offerings/import's dry-run/apply summary (see that route for semantics).
type ImportSummary = {
  updates: { line: number; testName: string; changes: Record<string, { from: string; to: string }> }[];
  unchanged: number;
  errors: { line: number; message: string }[];
  applied: boolean;
};

export default function OfferingsPage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [vendors, setVendors] = useState<Option[]>([]);
  const [tests, setTests] = useState<Option[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [testId, setTestId] = useState('');
  const [sort, setSort] = useState<SortKey>('test');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Excel audit import flow: pick file -> dry-run preview (modal) -> Apply. Same shape as the Tests
  // and per-vendor Catalog round-trips elsewhere in the admin.
  const fileInput = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const postImport = async (file: File, apply: boolean): Promise<ImportSummary | null> => {
    const formData = new FormData();
    formData.set('file', file);
    formData.set('apply', String(apply));
    const res = await fetch('/api/v1/admin/offerings/import', { method: 'POST', body: formData });
    const json = await res.json();
    if (!res.ok && !json.data) {
      setImportError(json.error?.message ?? 'Import failed.');
      return null;
    }
    return json.data as ImportSummary;
  };

  const onFilePicked = async (file: File) => {
    setImportError(null);
    setImportBusy(true);
    try {
      const preview = await postImport(file, false);
      if (preview) { setImportFile(file); setImportPreview(preview); }
    } catch {
      setImportError('Could not read that file.');
    } finally {
      setImportBusy(false);
      if (fileInput.current) fileInput.current.value = ''; // allow re-picking the same file
    }
  };

  const applyImport = async () => {
    if (!importFile) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const result = await postImport(importFile, true);
      if (result?.applied) {
        setImportPreview(null);
        setImportFile(null);
        setReloadKey((n) => n + 1);
      } else if (result) {
        setImportPreview(result); // apply was blocked (e.g. data changed since preview) — show why
      }
    } finally {
      setImportBusy(false);
    }
  };

  useEffect(() => {
    fetch('/api/v1/admin/vendors?sort=name').then((r) => r.json()).then((j) => setVendors((j.data ?? []).map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })))).catch(() => {});
    fetch('/api/v1/admin/tests?sort=name').then((r) => r.json()).then((j) => setTests((j.data ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })))).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ sort, dir });
    if (vendorId) params.set('vendorId', vendorId);
    if (testId) params.set('testId', testId);
    fetch(`/api/v1/admin/offerings?${params.toString()}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error?.message ?? 'Could not load offerings.');
        setOfferings(j.data ?? []);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : 'Could not load offerings — try again.');
        setOfferings([]);
      })
      .finally(() => setLoading(false));
  }, [vendorId, testId, sort, dir, reloadKey]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setDir(key === 'price' || key === 'updated' ? 'desc' : 'asc'); }
  };
  const arrow = (key: SortKey) => (sort === key ? (dir === 'asc' ? ' ↑' : ' ↓') : '');
  const thCls = 'cursor-pointer select-none p-3 hover:text-brand-900';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="admin-h1">Offerings</h1>
        <div className="flex items-center gap-3">
          <a href="/api/v1/admin/offerings/export" className="admin-btn" title="Download every live test↔vendor link across every vendor as one Excel workbook, sorted so each test's vendors sit together — for spotting a wrong URL/name match in bulk.">
            Export Excel
          </a>
          <button
            className="admin-btn"
            disabled={importBusy}
            onClick={() => fileInput.current?.click()}
            title="Upload an edited export — you'll see a preview of every change before anything is applied"
          >
            {importBusy && !importPreview ? 'Reading…' : 'Import Excel'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFilePicked(f); }}
          />
        </div>
      </div>
      <p className="mb-5 text-sm text-brand-400">
        Every test↔vendor price link, across every vendor. Add or remove individual links from each vendor&rsquo;s <span className="font-medium text-brand-600">Catalog</span> (Vendors → pick a vendor), or use <span className="font-medium text-brand-600">Export/Import Excel</span> above to review and fix mismatches in bulk — each vendor&rsquo;s own product name sits next to our test name, so a wrong match (e.g. a vendor&rsquo;s &ldquo;Iron&rdquo; link actually pointing at a Testosterone page) is easy to spot.
      </p>

      {importError && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{importError}</p>}

      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !importBusy && setImportPreview(null)}>
          <div className="admin-card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-h2 mb-1">Import preview</h2>
            <p className="mb-4 text-sm text-brand-400">
              {importPreview.updates.length} changed · {importPreview.unchanged} unchanged
              {importPreview.errors.length > 0 && <span className="font-medium text-red-600"> · {importPreview.errors.length} error{importPreview.errors.length === 1 ? '' : 's'}</span>}
            </p>

            {importPreview.errors.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 text-sm font-semibold text-red-700">Errors — fix the file and re-upload (nothing can be applied until these are gone)</h3>
                <ul className="space-y-1 text-sm text-red-700">
                  {importPreview.errors.map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}
                </ul>
              </div>
            )}

            {importPreview.updates.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 text-sm font-semibold text-brand-900">Changes</h3>
                <div className="space-y-2 text-sm">
                  {importPreview.updates.map((u) => (
                    <div key={u.line}>
                      <p className="text-brand-900">{u.testName}</p>
                      <ul className="ml-4 text-xs text-brand-600">
                        {Object.entries(u.changes ?? {}).map(([field, d]) => (
                          <li key={field}>
                            <span className="font-mono">{field}</span>: <span className="text-red-600 line-through">{d.from || '—'}</span> → <span className="text-green-700">{d.to || '—'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importPreview.updates.length === 0 && importPreview.errors.length === 0 && (
              <p className="mb-4 text-sm text-brand-400">The file matches the database — nothing to apply.</p>
            )}

            <div className="flex justify-end gap-3">
              <button className="admin-btn" disabled={importBusy} onClick={() => setImportPreview(null)}>Cancel</button>
              {importPreview.updates.length > 0 && importPreview.errors.length === 0 && (
                <button className="admin-btn" disabled={importBusy} onClick={applyImport}>
                  {importBusy ? 'Applying…' : `Apply ${importPreview.updates.length} change${importPreview.updates.length === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className="admin-input admin-input-inline" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select className="admin-input admin-input-inline" value={testId} onChange={(e) => setTestId(e.target.value)}>
          <option value="">All tests</option>
          {tests.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="text-sm text-brand-400">{offerings.length} link{offerings.length === 1 ? '' : 's'}</span>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className={thCls} onClick={() => toggleSort('test')}>Test{arrow('test')}</th>
              <th className={thCls} onClick={() => toggleSort('vendor')}>Vendor{arrow('vendor')}</th>
              <th className={`${thCls} text-right`} onClick={() => toggleSort('price')}>Current Price{arrow('price')}</th>
              <th className="p-3 text-right">Previous</th>
              <th className={thCls} onClick={() => toggleSort('updated')}>Last Updated{arrow('updated')}</th>
              <th className="p-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-brand-400">Loading...</td></tr>
            ) : loadError ? (
              <tr><td colSpan={6} className="p-6 text-center text-red-600">{loadError} <button className="ml-2 underline" onClick={() => setReloadKey((k) => k + 1)}>Retry</button></td></tr>
            ) : offerings.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-brand-400">No offerings found.</td></tr>
            ) : (
              offerings.map((o) => (
                <tr key={o.id} className="border-b border-brand-100 hover:bg-brand-50/50">
                  <td className="p-3 font-medium text-brand-900">{o.testName}</td>
                  <td className="whitespace-nowrap p-3">
                    <Link href={`/admin/vendors/${o.vendorId}`} className="text-brand-600 hover:text-brand-900 hover:underline">
                      {o.vendorName}
                    </Link>
                  </td>
                  <td className="p-3 text-right font-medium text-brand-900">{o.currentPrice != null ? `$${o.currentPrice.toFixed(2)}` : '—'}</td>
                  <td className="p-3 text-right text-brand-400">{o.previousPrice != null ? `$${o.previousPrice.toFixed(2)}` : '—'}</td>
                  <td className="p-3 text-brand-400">{o.priceUpdatedAt ? new Date(o.priceUpdatedAt).toLocaleDateString() : '—'}</td>
                  <td className="p-3"><span className={`inline-block h-2.5 w-2.5 rounded-full ${o.isActive ? 'bg-success-500' : 'bg-brand-200'}`} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
