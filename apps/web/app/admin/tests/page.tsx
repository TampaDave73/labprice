'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// Shape of /api/v1/admin/tests/import's dry-run/apply summary (see that route for semantics).
type ImportSummary = {
  creates: { line: number; name: string; slug: string; categories: string[] }[];
  updates: { line: number; id?: string; name: string; changes?: Record<string, { from: string; to: string }> }[];
  unchanged: number;
  errors: { line: number; message: string }[];
  newCategories: string[];
  applied: boolean;
};

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
  const [refresh, setRefresh] = useState(0); // bumped after a CSV apply to reload the table

  // CSV import flow: pick file → dry-run preview (modal) → Apply. The csv text is held so Apply
  // re-posts the exact same file the preview was computed from.
  const fileInput = useRef<HTMLInputElement>(null);
  const [importCsv, setImportCsv] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const postImport = async (csv: string, apply: boolean): Promise<ImportSummary | null> => {
    const res = await fetch('/api/v1/admin/tests/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv, apply }),
    });
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
      const text = await file.text();
      const preview = await postImport(text, false);
      if (preview) { setImportCsv(text); setImportPreview(preview); }
    } catch {
      setImportError('Could not read that file.');
    } finally {
      setImportBusy(false);
      if (fileInput.current) fileInput.current.value = ''; // allow re-picking the same file
    }
  };

  const applyImport = async () => {
    if (!importCsv) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const result = await postImport(importCsv, true);
      if (result?.applied) {
        setImportPreview(null);
        setImportCsv(null);
        setRefresh((n) => n + 1);
      } else if (result) {
        setImportPreview(result); // apply was blocked (e.g. data changed since preview) — show why
      }
    } finally {
      setImportBusy(false);
    }
  };

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
  }, [search, sort, dir, refresh]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setDir(key === 'created' || key === 'popular' ? 'desc' : 'asc'); }
  };

  const arrow = (key: SortKey) => (sort === key ? (dir === 'asc' ? ' ↑' : ' ↓') : '');
  const thCls = 'cursor-pointer select-none p-3 hover:text-brand-900';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="admin-h1">Tests</h1>
        <div className="flex items-center gap-3">
          <a href="/api/v1/admin/tests/export" className="admin-btn" title="Download every test as CSV (identity fields only — no prices)">
            Export CSV
          </a>
          <button
            className="admin-btn"
            disabled={importBusy}
            onClick={() => fileInput.current?.click()}
            title="Upload an edited export — you'll see a preview of every change before anything is applied"
          >
            {importBusy && !importPreview ? 'Reading…' : 'Import CSV'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFilePicked(f); }}
          />
          <Link href="/admin/tests/new" className="admin-btn">
            Add Test
          </Link>
        </div>
      </div>

      {importError && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{importError}</p>}

      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !importBusy && setImportPreview(null)}>
          <div className="admin-card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-h2 mb-1">Import preview</h2>
            <p className="mb-4 text-sm text-brand-400">
              {importPreview.creates.length} new · {importPreview.updates.length} changed · {importPreview.unchanged} unchanged
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

            {importPreview.newCategories.length > 0 && (
              <p className="mb-4 text-sm text-brand-600">
                Will create {importPreview.newCategories.length} new categor{importPreview.newCategories.length === 1 ? 'y' : 'ies'}: {importPreview.newCategories.join(', ')}
              </p>
            )}

            {importPreview.creates.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 text-sm font-semibold text-brand-900">New tests</h3>
                <ul className="space-y-1 text-sm text-brand-600">
                  {importPreview.creates.map((c) => (
                    <li key={c.line}>{c.name} <span className="text-brand-400">({c.slug} · {c.categories.join(', ')})</span></li>
                  ))}
                </ul>
              </div>
            )}

            {importPreview.updates.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 text-sm font-semibold text-brand-900">Changed tests</h3>
                <div className="space-y-2 text-sm">
                  {importPreview.updates.map((u) => (
                    <div key={u.line}>
                      <p className="text-brand-900">{u.name}</p>
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

            {importPreview.creates.length === 0 && importPreview.updates.length === 0 && importPreview.errors.length === 0 && (
              <p className="mb-4 text-sm text-brand-400">The file matches the database — nothing to apply.</p>
            )}

            <div className="flex justify-end gap-3">
              <button className="admin-btn" disabled={importBusy} onClick={() => setImportPreview(null)}>Cancel</button>
              {(importPreview.creates.length > 0 || importPreview.updates.length > 0) && importPreview.errors.length === 0 && (
                <button className="admin-btn" disabled={importBusy} onClick={applyImport}>
                  {importBusy ? 'Applying…' : `Apply ${importPreview.creates.length + importPreview.updates.length} change${importPreview.creates.length + importPreview.updates.length === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
