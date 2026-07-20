'use client';

// /admin/discovered — the review queue over the VendorProduct ingest layer. Catalog growth as
// review-and-approve: unmatched vendor products arrive grouped into cross-vendor clusters; one
// click promotes a cluster to a new Test, attaches it to an existing one, or ignores it. Matching
// alone never lists anything publicly — the Matched tab holds "matched, not yet listed" rows whose
// offerings are created here deliberately.
import { useCallback, useEffect, useState } from 'react';

type ProductRow = {
  id: string;
  name: string;
  url: string | null;
  price: string | null;
  questCode: string | null;
  labcorpCode: string | null;
  labProvider: string | null;
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
  products: ProductRow[];
};

type Demand = { query: string; searches: number; clusterKeys: string[]; clusterNames: string[] };
type Counts = { clusters: number; matched: number; panels: number; ignored: number };
type Tab = 'clusters' | 'matched' | 'panels' | 'ignored';

const TABS: { key: Tab; label: string }[] = [
  { key: 'clusters', label: 'Discovered' },
  { key: 'matched', label: 'Matched, not listed' },
  { key: 'panels', label: 'Panels' },
  { key: 'ignored', label: 'Ignored' },
];

export default function DiscoveredPage() {
  const [tab, setTab] = useState<Tab>('clusters');
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Counts>({ clusters: 0, matched: 0, panels: 0, ignored: 0 });
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [demand, setDemand] = useState<Demand[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ tab });
    if (search) params.set('search', search);
    const res = await fetch(`/api/v1/admin/discovered?${params.toString()}`);
    const json = await res.json();
    setCounts(json.data?.counts ?? { clusters: 0, matched: 0, panels: 0, ignored: 0 });
    setClusters(json.data?.clusters ?? []);
    setDemand(json.data?.demand ?? []);
    setProducts(json.data?.products ?? []);
    setLoading(false);
  }, [tab, search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    fetch('/api/v1/admin/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? []));
  }, []);

  // Test-picker search for Attach (reuses the admin tests list API).
  useEffect(() => {
    if (!attachFor) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/v1/admin/tests?search=${encodeURIComponent(testQuery)}&limit=8`);
      const json = await res.json();
      setTestResults((json.data ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
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
      if (!res.ok) setNotice(json.error?.message ?? 'Action failed.');
      else { setNotice(doneMsg); await load(); }
    } finally {
      setBusy(false);
    }
  };

  const openPromote = (c: Cluster) => {
    setPromoteFor(c);
    setPromoteForm({
      name: c.name,
      shortName: '',
      categoryId: '',
      questCode: c.questCode ?? '',
      labcorpCode: c.labcorpCode ?? '',
    });
  };

  const money = (v: string | number | null) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);

  const productTable = (rows: ProductRow[], extra?: (p: ProductRow) => React.ReactNode) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
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
      <h1 className="admin-h1 mb-2">Discovered products</h1>
      <p className="mb-6 max-w-3xl text-sm text-brand-400">
        Everything the catalog scrapers found that isn't a listed test yet. Promote a cluster to a new
        test, attach it to an existing one, or ignore it — confirmed names are learned as aliases, so
        the same vendor naming matches automatically next crawl.
      </p>

      {notice && <p className="mb-4 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-700">{notice}</p>}

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
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button className="admin-btn text-sm" disabled={busy} onClick={() => openPromote(c)}>Promote to test</button>
                    <button
                      className="admin-btn text-sm"
                      disabled={busy}
                      onClick={() => { setAttachFor(c); setTestQuery(c.suggestedTest?.name ?? c.name); }}
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
                <div className="overflow-x-auto">{productTable(c.products)}</div>
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
                <button className="admin-btn text-sm" disabled={busy} onClick={() => act({ action: 'restore', productIds: [p.id] }, 'Restored to review.')}>
                  Restore
                </button>
              );
            }
            return null; // panels: excluded by decision — display only
          })}
        </div>
      )}

      {/* Attach modal: pick an existing test */}
      {attachFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAttachFor(null)}>
          <div className="admin-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-h2 mb-1">Attach “{attachFor.name}”</h2>
            <p className="mb-3 text-sm text-brand-400">
              Links {attachFor.products.length} vendor product(s) to an existing test, creates the
              offerings, and learns the vendors' names as aliases.
            </p>
            <input autoFocus type="text" className="admin-input mb-2 w-full" placeholder="Search your tests…" value={testQuery} onChange={(e) => setTestQuery(e.target.value)} />
            <div className="mb-4 max-h-56 overflow-y-auto">
              {testResults.map((t) => (
                <button
                  key={t.id}
                  className="block w-full rounded px-3 py-2 text-left text-sm text-brand-900 hover:bg-brand-50"
                  disabled={busy}
                  onClick={async () => {
                    await act({ action: 'attach', productIds: attachFor.products.map((p) => p.id), testId: t.id }, `Attached to ${t.name}.`);
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
              Creates the test and lists {promoteFor.products.length} vendor offering(s) with their
              observed prices. Copy/details can be filled afterwards in the test editor (✨ Auto-fill).
            </p>
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
                disabled={busy || !promoteForm.name.trim() || !promoteForm.categoryId}
                onClick={async () => {
                  await act(
                    {
                      action: 'promote',
                      productIds: promoteFor.products.map((p) => p.id),
                      name: promoteForm.name,
                      shortName: promoteForm.shortName,
                      categoryId: promoteForm.categoryId,
                      questCode: promoteForm.questCode,
                      labcorpCode: promoteForm.labcorpCode,
                    },
                    `Created ${promoteForm.name} and listed ${promoteFor.products.length} offering(s).`,
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
