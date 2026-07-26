'use client';

// /admin/discovered — the review queue over the VendorProduct ingest layer. Catalog growth as
// review-and-approve: unmatched vendor products arrive grouped into cross-vendor clusters; one
// click promotes a cluster to a new Test, attaches it to an existing one, or ignores it. Matching
// alone never lists anything publicly — the Matched tab holds "matched, not yet listed" rows whose
// offerings are created here deliberately.
import { useCallback, useEffect, useRef, useState } from 'react';

// Shape of /api/v1/admin/discovered/import's dry-run/apply summary (see that route for semantics).
type ImportSummary = {
  ignore: { count: number };
  attach: { testSlug: string; testName: string; count: number; duplicateVendorRows: number }[];
  promote: { slug: string; name: string; categories: string[]; count: number; questCode: string | null; labcorpCode: string | null; duplicateVendorRows: number }[];
  skipped: { line: number; vendorProductId: string; reason: string }[];
  errors: { line: number; message: string }[];
  newCategories: string[];
  offeringsWithoutPrice: number;
  droppedDuplicates: { vendorId: string; name: string }[];
  applied: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  url: string | null;
  price: string | null;
  questCode: string | null;
  labcorpCode: string | null;
  labProvider: string | null;
  isPanel: boolean;
  matchedBy: string | null;
  lastSeenAt: string;
  vendor: { id: string; name: string; slug: string };
  test: { id: string; name: string } | null;
  suggestedTest: { id: string; name: string } | null;
  hasOffering?: boolean;
};

type Cluster = {
  key: string;
  name: string;
  vendorCount: number;
  priceMin: number | null;
  priceMax: number | null;
  questCode: string | null;
  labcorpCode: string | null;
  suggestedTest: { id: string; name: string } | null;
  duplicateVendors: string[];
  products: ProductRow[];
};

type Demand = { query: string; searches: number; clusterKeys: string[]; clusterNames: string[] };
type Counts = { clusters: number; matched: number; ignored: number };
type Tab = 'clusters' | 'matched' | 'ignored';

const TABS: { key: Tab; label: string }[] = [
  { key: 'clusters', label: 'Discovered' },
  { key: 'matched', label: 'Matched, not listed' },
  { key: 'ignored', label: 'Ignored' },
];

export default function DiscoveredPage() {
  const [tab, setTab] = useState<Tab>('clusters');
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Counts>({ clusters: 0, matched: 0, ignored: 0 });
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [demand, setDemand] = useState<Demand[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Attach flow: which cluster's picker is open + its test-search state.
  const [attachFor, setAttachFor] = useState<Cluster | null>(null);
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<{ id: string; name: string }[]>([]);

  // Promote flow: modal prefilled from the cluster.
  const [promoteFor, setPromoteFor] = useState<Cluster | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [promoteForm, setPromoteForm] = useState({ name: '', shortName: '', categoryId: '', questCode: '', labcorpCode: '' });

  // Row selection within a cluster card — unchecked rows get Ignored instead of promoted/attached.
  // Keyed by product id (globally unique), default empty (= everything checked).
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // Bulk Excel round-trip (the quarterly catch-up pass — see export/import route comments): pick file
  // → dry-run preview (modal) → Apply. The File is held so Apply re-posts the exact file the preview
  // was computed from.
  const fileInput = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const postImport = async (file: File, apply: boolean): Promise<ImportSummary | null> => {
    const formData = new FormData();
    formData.set('file', file);
    formData.set('apply', String(apply));
    const res = await fetch('/api/v1/admin/discovered/import', { method: 'POST', body: formData });
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
      if (fileInput.current) fileInput.current.value = '';
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
        setNotice(result.droppedDuplicates.length > 0
          ? `Import applied. ${result.droppedDuplicates.length} product(s) skipped as same-vendor duplicates: ${result.droppedDuplicates.map((d) => d.name).join(', ')}.`
          : 'Import applied.');
        await load();
      } else if (result) {
        setImportPreview(result); // apply was blocked (e.g. data drifted since preview) — show why
      }
    } finally {
      setImportBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ tab });
      if (search) params.set('search', search);
      const res = await fetch(`/api/v1/admin/discovered?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message ?? 'Could not load discovered products.');
      setCounts(json.data?.counts ?? { clusters: 0, matched: 0, ignored: 0 });
      setClusters(json.data?.clusters ?? []);
      setDemand(json.data?.demand ?? []);
      setProducts(json.data?.products ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load discovered products — try again.');
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    fetch('/api/v1/admin/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? [])).catch(() => {});
  }, []);

  // Test-picker search for Attach (reuses the admin tests list API).
  useEffect(() => {
    if (!attachFor) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/admin/tests?search=${encodeURIComponent(testQuery)}&limit=8`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;
        setTestResults((json.data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      } catch {
        // Non-critical: the picker just keeps showing whatever results it already had.
      }
    }, 250);
    return () => clearTimeout(t);
  }, [attachFor, testQuery]);

  const act = async (payload: Record<string, unknown>, doneMsg: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/v1/admin/discovered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json.error?.message ?? 'Action failed.');
      } else {
        const dropped: { vendorId: string; name: string }[] = json.data?.droppedDuplicates ?? [];
        setNotice(dropped.length > 0
          ? `${doneMsg} ${dropped.length} product(s) skipped — their vendor already had an offering on this test from another row in the same action: ${dropped.map((d) => d.name).join(', ')}.`
          : doneMsg);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  // Used by Promote/Attach on a cluster: unchecked rows get Ignored first, then the checked rows go
  // through the requested action — as one busy/notice/reload cycle instead of two, so the notice
  // doesn't flash between an "ignored" message and the final one.
  const runIgnoreThenAction = async (
    action: 'promote' | 'attach',
    clusterProducts: ProductRow[],
    actionPayload: Record<string, unknown>,
    doneMsg: string,
  ) => {
    const included = clusterProducts.filter((p) => !excludedIds.has(p.id));
    const excluded = clusterProducts.filter((p) => excludedIds.has(p.id));
    if (included.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      if (excluded.length > 0) {
        await fetch('/api/v1/admin/discovered', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ignore', productIds: excluded.map((p) => p.id) }),
        });
      }
      const res = await fetch('/api/v1/admin/discovered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, productIds: included.map((p) => p.id), ...actionPayload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json.error?.message ?? 'Action failed.');
      } else {
        const dropped: { vendorId: string; name: string }[] = json.data?.droppedDuplicates ?? [];
        const parts = [doneMsg];
        if (excluded.length > 0) parts.push(`${excluded.length} unselected product(s) marked Ignored.`);
        if (dropped.length > 0) parts.push(`${dropped.length} product(s) skipped as same-vendor duplicates: ${dropped.map((d) => d.name).join(', ')}.`);
        setNotice(parts.join(' '));
        setExcludedIds((prev) => {
          const next = new Set(prev);
          for (const p of clusterProducts) next.delete(p.id);
          return next;
        });
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const openPromote = (c: Cluster) => {
    setPromoteFor(c);
    // Prune to this cluster's ids only — drops stale exclusions from other clusters while
    // preserving any in-progress unchecking the admin just did on this card (see Fix 2, final review).
    setExcludedIds((prev) => new Set([...prev].filter((id) => c.products.some((p) => p.id === id))));
    setPromoteForm({
      name: c.name,
      shortName: '',
      categoryId: '',
      questCode: c.questCode ?? '',
      labcorpCode: c.labcorpCode ?? '',
    });
  };

  const money = (v: string | number | null) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);

  const productTable = (rows: ProductRow[], extra?: (p: ProductRow) => React.ReactNode, selectable?: boolean) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
          {selectable && <th className="w-8 p-2" />}
          <th className="p-2">Vendor</th>
          <th className="p-2">Vendor's name</th>
          <th className="p-2 text-right">Price</th>
          <th className="p-2">Codes</th>
          {extra && <th className="p-2" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-brand-50 last:border-0">
            {selectable && (
              <td className="p-2">
                <input
                  type="checkbox"
                  checked={!excludedIds.has(p.id)}
                  onChange={() => setExcludedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                    return next;
                  })}
                  title="Uncheck to leave this row out — it'll be marked Ignored instead of promoted/attached"
                />
              </td>
            )}
            <td className="p-2 text-brand-600">{p.vendor.name}</td>
            <td className="p-2">
              {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-brand-900 hover:text-brand-600 hover:underline">{p.name}</a> : <span className="text-brand-900">{p.name}</span>}
            </td>
            <td className="p-2 text-right text-brand-900">{money(p.price)}</td>
            <td className="p-2 font-mono text-xs text-brand-400">
              {[p.questCode && `Q ${p.questCode}`, p.labcorpCode && `LC ${p.labcorpCode}`].filter(Boolean).join(' · ') || '—'}
            </td>
            {extra && <td className="p-2 text-right">{extra(p)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="admin-h1">Discovered products</h1>
        <div className="flex items-center gap-3">
          <a href="/api/v1/admin/discovered/export" className="admin-btn" title="Download the review queue as an Excel workbook — a 'How it works' sheet, a Categories reference sheet, and the data (one row per vendor product) with a category dropdown and header tooltips">
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
      <p className="mb-6 max-w-3xl text-sm text-brand-400">
        Everything the catalog scrapers found that isn't a listed test yet. Promote a cluster to a new
        test, attach it to an existing one, or ignore it — confirmed names are learned as aliases, so
        the same vendor naming matches automatically next crawl. For a big catch-up pass, Export Excel
        and work offline instead of clicking through clusters one at a time — the file explains itself
        (a "How it works" sheet, header tooltips, and a category dropdown).
      </p>

      {notice && <p className="mb-4 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-700">{notice}</p>}
      {importError && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{importError}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t.key ? 'bg-brand-900 text-white' : 'bg-white text-brand-600 hover:text-brand-900'}`}
          >
            {t.label} <span className="opacity-60">({counts[t.key]})</span>
          </button>
        ))}
        <input
          type="text"
          placeholder="Search product names…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-input ml-auto max-w-xs"
        />
      </div>

      {tab === 'clusters' && demand.length > 0 && (
        <div className="admin-card mb-4 p-4">
          <h2 className="mb-1 text-sm font-semibold text-brand-900">People search for these — and vendors sell them</h2>
          <p className="mb-2 text-xs text-brand-400">Zero-result site searches that overlap an unmatched vendor product. The strongest signal for what to add next.</p>
          <div className="flex flex-wrap gap-2">
            {demand.map((d) => (
              <button
                key={d.query}
                className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                title={`Sold as: ${d.clusterNames.join('; ')}`}
                onClick={() => setSearch(d.clusterNames[0] ?? d.query)}
              >
                “{d.query}” × {d.searches}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="admin-card p-6 text-center text-brand-400">Loading…</div>
      ) : loadError ? (
        <div className="admin-card p-6 text-center">
          <p className="mb-2 text-sm text-red-600">{loadError}</p>
          <button className="admin-btn admin-btn-sm" onClick={load}>Try again</button>
        </div>
      ) : tab === 'clusters' ? (
        clusters.length === 0 ? (
          <div className="admin-card p-6 text-center text-brand-400">Nothing waiting — every non-panel product the scrapers found is matched, listed, or ignored.</div>
        ) : (
          <div className="space-y-4">
            {clusters.map((c) => (
              <div key={c.key} className="admin-card p-4">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-brand-900">{c.name}</h3>
                    <p className="text-xs text-brand-400">
                      {c.vendorCount} vendor{c.vendorCount === 1 ? '' : 's'}
                      {c.priceMin != null && ` · ${money(c.priceMin)}${c.priceMax != null && c.priceMax !== c.priceMin ? `–${money(c.priceMax)}` : ''}`}
                      {c.questCode && ` · Quest ${c.questCode}`}
                      {c.labcorpCode && ` · LabCorp ${c.labcorpCode}`}
                    </p>
                    {c.suggestedTest && (
                      <p className="mt-1 text-xs text-amber-700">Looks similar to your test “{c.suggestedTest.name}” — attach if it's the same thing.</p>
                    )}
                    {c.duplicateVendors.length > 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        ⚠ {c.duplicateVendors.join(', ')} {c.duplicateVendors.length === 1 ? 'appears' : 'appear'} twice here — this cluster still mixes two different products. Uncheck the row(s) below that don't belong before promoting/attaching; unchecked rows are marked Ignored.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button className="admin-btn text-sm" disabled={busy} onClick={() => openPromote(c)}>Promote to test</button>
                    <button
                      className="admin-btn text-sm"
                      disabled={busy}
                      onClick={() => { setAttachFor(c); setExcludedIds((prev) => new Set([...prev].filter((id) => c.products.some((p) => p.id === id)))); setTestQuery(c.suggestedTest?.name ?? c.name); }}
                    >
                      Attach to existing…
                    </button>
                    <button
                      className="admin-btn text-sm"
                      disabled={busy}
                      onClick={() => act({ action: 'ignore', productIds: c.products.map((p) => p.id) }, `Ignored ${c.products.length} product(s).`)}
                    >
                      Ignore
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">{productTable(c.products, undefined, true)}</div>
              </div>
            ))}
          </div>
        )
      ) : products.length === 0 ? (
        <div className="admin-card p-6 text-center text-brand-400">Nothing here.</div>
      ) : (
        <div className="admin-card overflow-x-auto p-4">
          {tab === 'matched' && counts.matched > 0 && (
            <div className="mb-3 flex justify-end">
              <button
                className="admin-btn text-sm"
                disabled={busy}
                onClick={() => act(
                  { action: 'list', productIds: products.filter((p) => !p.hasOffering).map((p) => p.id) },
                  'Created offerings for all matched products.',
                )}
              >
                List all ({products.filter((p) => !p.hasOffering).length})
              </button>
            </div>
          )}
          {productTable(products, (p) => {
            if (tab === 'matched') {
              return p.hasOffering ? (
                <span className="text-xs text-brand-400" title={`Matched to ${p.test?.name ?? '?'} (${p.matchedBy})`}>listed ✓</span>
              ) : (
                <button
                  className="admin-btn text-sm"
                  disabled={busy}
                  title={`Matched to ${p.test?.name ?? '?'} (${p.matchedBy}) — create the public offering`}
                  onClick={() => act({ action: 'list', productIds: [p.id] }, `Listed ${p.name}.`)}
                >
                  List
                </button>
              );
            }
            if (tab === 'ignored') {
              return (
                <button
                  className="admin-btn text-sm"
                  disabled={busy || p.isPanel}
                  title={p.isPanel ? "This is an auto-detected panel — restoring won't stick since the next crawl re-ignores it automatically. Panels aren't priced individually on this site." : undefined}
                  onClick={() => act({ action: 'restore', productIds: [p.id] }, 'Restored to review.')}
                >
                  Restore
                </button>
              );
            }
            return null;
          })}
        </div>
      )}

      {/* CSV import preview */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !importBusy && setImportPreview(null)}>
          <div className="admin-card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-h2 mb-1">Import preview</h2>
            <p className="mb-4 text-sm text-brand-400">
              {importPreview.promote.reduce((n, g) => n + g.count, 0)} → {importPreview.promote.length} new test{importPreview.promote.length === 1 ? '' : 's'}
              {' · '}{importPreview.attach.reduce((n, g) => n + g.count, 0)} → {importPreview.attach.length} existing test{importPreview.attach.length === 1 ? '' : 's'}
              {' · '}{importPreview.ignore.count} ignored
              {importPreview.skipped.length > 0 && ` · ${importPreview.skipped.length} skipped (already decided elsewhere)`}
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

            {importPreview.offeringsWithoutPrice > 0 && (
              <p className="mb-4 text-sm text-amber-700">
                {importPreview.offeringsWithoutPrice} offering(s) will be created without a price — that vendor's detail page wasn't fetched on the last crawl. Price fills in on the next scrape.
              </p>
            )}

            {(importPreview.promote.some((g) => g.duplicateVendorRows > 0) || importPreview.attach.some((g) => g.duplicateVendorRows > 0)) && (
              <p className="mb-4 text-sm text-amber-700">
                ⚠ Some groups route two rows from the same vendor to the same test — only the first will get an offering, the rest are skipped (marked ⚠ below).
              </p>
            )}

            {importPreview.droppedDuplicates.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 text-sm font-semibold text-amber-700">Skipped as same-vendor duplicates</h3>
                <ul className="space-y-1 text-xs text-amber-700">
                  {importPreview.droppedDuplicates.map((d, i) => <li key={i}>{d.name}</li>)}
                </ul>
              </div>
            )}

            {importPreview.promote.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 text-sm font-semibold text-brand-900">New tests</h3>
                <ul className="space-y-1 text-sm text-brand-600">
                  {importPreview.promote.map((g) => (
                    <li key={g.slug}>
                      {g.name} <span className="text-brand-400">({g.categories.join(', ')} · {g.count} vendor{g.count === 1 ? '' : 's'})</span>
                      {g.duplicateVendorRows > 0 && <span className="text-amber-700"> ⚠ {g.duplicateVendorRows} same-vendor row{g.duplicateVendorRows === 1 ? '' : 's'} will be skipped</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importPreview.attach.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 text-sm font-semibold text-brand-900">Attached to existing tests</h3>
                <ul className="space-y-1 text-sm text-brand-600">
                  {importPreview.attach.map((g) => (
                    <li key={g.testSlug}>
                      {g.testName} <span className="text-brand-400">(+{g.count} vendor{g.count === 1 ? '' : 's'})</span>
                      {g.duplicateVendorRows > 0 && <span className="text-amber-700"> ⚠ {g.duplicateVendorRows} same-vendor row{g.duplicateVendorRows === 1 ? '' : 's'} will be skipped</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importPreview.skipped.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 text-sm font-semibold text-brand-900">Skipped</h3>
                <ul className="space-y-1 text-xs text-brand-400">
                  {importPreview.skipped.slice(0, 20).map((s, i) => <li key={i}>Line {s.line}: {s.reason}</li>)}
                  {importPreview.skipped.length > 20 && <li>…and {importPreview.skipped.length - 20} more.</li>}
                </ul>
              </div>
            )}

            {importPreview.promote.length === 0 && importPreview.attach.length === 0 && importPreview.ignore.count === 0 && importPreview.errors.length === 0 && (
              <p className="mb-4 text-sm text-brand-400">Nothing to apply — every row is blank, skipped, or already applied.</p>
            )}

            <div className="flex justify-end gap-3">
              <button className="admin-btn" disabled={importBusy} onClick={() => setImportPreview(null)}>Cancel</button>
              {(importPreview.promote.length > 0 || importPreview.attach.length > 0 || importPreview.ignore.count > 0) && importPreview.errors.length === 0 && (
                <button className="admin-btn" disabled={importBusy} onClick={applyImport}>
                  {importBusy ? 'Applying…' : 'Apply'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attach modal: pick an existing test */}
      {attachFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAttachFor(null)}>
          <div className="admin-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-h2 mb-1">Attach “{attachFor.name}”</h2>
            <p className="mb-3 text-sm text-brand-400">
              Links the checked vendor product(s) below to an existing test, creates the offerings,
              and learns the vendors' names as aliases. Unchecked rows are marked Ignored instead.
            </p>
            <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-brand-100">
              {productTable(attachFor.products, undefined, true)}
            </div>
            <input autoFocus type="text" className="admin-input mb-2 w-full" placeholder="Search your tests…" value={testQuery} onChange={(e) => setTestQuery(e.target.value)} />
            <div className="mb-4 max-h-56 overflow-y-auto">
              {testResults.map((t) => (
                <button
                  key={t.id}
                  className="block w-full rounded px-3 py-2 text-left text-sm text-brand-900 hover:bg-brand-50 disabled:opacity-50"
                  disabled={busy || attachFor.products.every((p) => excludedIds.has(p.id))}
                  onClick={async () => {
                    await runIgnoreThenAction('attach', attachFor.products, { testId: t.id }, `Attached to ${t.name}.`);
                    setAttachFor(null);
                  }}
                >
                  {t.name}
                </button>
              ))}
              {testResults.length === 0 && <p className="px-3 py-2 text-sm text-brand-400">No tests match.</p>}
            </div>
            <div className="flex justify-end">
              <button className="admin-btn" onClick={() => setAttachFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Promote modal: create a new test from the cluster */}
      {promoteFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPromoteFor(null)}>
          <div className="admin-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-h2 mb-1">Promote to a new test</h2>
            <p className="mb-3 text-sm text-brand-400">
              Creates the test and lists the checked vendor offering(s) below with their observed
              prices. Unchecked rows are marked Ignored instead. Copy/details can be filled
              afterwards in the test editor (✨ Auto-fill).
            </p>
            <div className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-brand-100">
              {productTable(promoteFor.products, undefined, true)}
            </div>
            <label className="mb-2 block text-xs text-brand-400">
              Name
              <input type="text" className="admin-input mt-1 w-full" value={promoteForm.name} onChange={(e) => setPromoteForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="mb-2 block text-xs text-brand-400">
              Category (required)
              <select className="admin-input mt-1 w-full" value={promoteForm.categoryId} onChange={(e) => setPromoteForm((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Choose a category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <label className="block text-xs text-brand-400">
                Quest code
                <input type="text" className="admin-input mt-1 w-full" value={promoteForm.questCode} onChange={(e) => setPromoteForm((f) => ({ ...f, questCode: e.target.value }))} />
              </label>
              <label className="block text-xs text-brand-400">
                LabCorp code
                <input type="text" className="admin-input mt-1 w-full" value={promoteForm.labcorpCode} onChange={(e) => setPromoteForm((f) => ({ ...f, labcorpCode: e.target.value }))} />
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <button className="admin-btn" disabled={busy} onClick={() => setPromoteFor(null)}>Cancel</button>
              <button
                className="admin-btn"
                disabled={busy || !promoteForm.name.trim() || !promoteForm.categoryId || promoteFor.products.every((p) => excludedIds.has(p.id))}
                onClick={async () => {
                  const includedCount = promoteFor.products.filter((p) => !excludedIds.has(p.id)).length;
                  await runIgnoreThenAction(
                    'promote',
                    promoteFor.products,
                    {
                      name: promoteForm.name,
                      shortName: promoteForm.shortName,
                      categoryId: promoteForm.categoryId,
                      questCode: promoteForm.questCode,
                      labcorpCode: promoteForm.labcorpCode,
                    },
                    `Created ${promoteForm.name} and listed ${includedCount} offering(s).`,
                  );
                  setPromoteFor(null);
                }}
              >
                {busy ? 'Creating…' : 'Create test'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
