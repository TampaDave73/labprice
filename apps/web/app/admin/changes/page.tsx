'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Change = {
  id: string;
  oldPrice: string | null;
  newPrice: string;
  status: string;
  createdAt: string;
  offering: {
    id: string;
    externalUrl: string | null;
    test: { id: string; name: string };
    vendor: { id: string; name: string; websiteUrl: string | null };
  };
};

const TABS = ['All', 'PENDING', 'APPROVED', 'REJECTED'] as const;
const PAGE_SIZE = 25;

export default function ChangeQueuePage() {
  // ?status=PENDING deep-links from the dashboard's attention cards straight to a filtered tab.
  const initialStatus = useSearchParams().get('status');
  const [changes, setChanges] = useState<Change[]>([]);
  const [tab, setTab] = useState<string>(
    initialStatus && (TABS as readonly string[]).includes(initialStatus) ? initialStatus : 'All',
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Same cursor-stack pagination as /admin/tests — see that page for the reasoning.
  const [pageCursors, setPageCursors] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);

  // Row-local edit state, keyed by staged-change id. `urlDrafts`/`priceDrafts` only exist while a
  // row is being edited; committed values live back on `changes` after a successful save/approve.
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [urlSaving, setUrlSaving] = useState<string | null>(null);

  useEffect(() => { setPageIndex(0); setPageCursors([undefined]); }, [tab]);

  const fetchChanges = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (tab !== 'All') params.set('status', tab);
      const cursor = pageCursors[pageIndex];
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/v1/admin/staged-changes?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message ?? 'Could not load the change queue.');
      setChanges(json.data ?? []);
      setNextCursor(json.nextCursor);
      setSelected(new Set());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the change queue — try again.');
      setChanges([]);
      setNextCursor(undefined);
    } finally {
      setLoading(false);
    }
  }, [tab, pageIndex, pageCursors]);

  useEffect(() => { fetchChanges(); }, [fetchChanges]);

  const goNext = () => {
    if (!nextCursor) return;
    setPageCursors((prev) => (prev.length === pageIndex + 1 ? [...prev, nextCursor] : prev));
    setPageIndex((i) => i + 1);
  };
  const goPrev = () => setPageIndex((i) => Math.max(0, i - 1));

  const handleAction = async (action: 'approve' | 'reject', ids: string[], overridePrice?: number) => {
    setActionError(null);
    const res = await fetch('/api/v1/admin/staged-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids, ...(overridePrice != null ? { overridePrice } : {}) }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error?.message ?? `Could not ${action} the selected change(s).`);
      return;
    }
    setPriceDrafts((d) => { const next = { ...d }; for (const id of ids) delete next[id]; return next; });
    fetchChanges();
  };

  // Independent of approve/reject — this edits Offering.externalUrl directly via the same endpoint
  // the Vendors catalog table uses, so it's live immediately and isn't affected by what the reviewer
  // does with the pending price change (and vice versa).
  const saveUrl = async (c: Change) => {
    const url = (urlDrafts[c.id] ?? '').trim();
    setUrlSaving(c.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/admin/vendors/${c.offering.vendor.id}/offerings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeringId: c.offering.id, externalUrl: url || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActionError(j.error?.message ?? 'Could not save that URL.');
        return;
      }
      setChanges((prev) => prev.map((x) => (x.id === c.id ? { ...x, offering: { ...x.offering, externalUrl: url || null } } : x)));
      setEditingUrl(null);
    } catch {
      setActionError('Could not save that URL — check your connection and try again.');
    } finally {
      setUrlSaving(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === changes.length) setSelected(new Set());
    else setSelected(new Set(changes.map((c) => c.id)));
  };

  const pctChange = (oldP: string | null, newP: string) => {
    if (!oldP || Number(oldP) === 0) return null;
    return ((Number(newP) - Number(oldP)) / Number(oldP)) * 100;
  };

  return (
    <div>
      <h1 className="admin-h1 mb-2">Change Queue</h1>
      <div className="admin-card mb-6 max-w-3xl p-4">
        <p className="text-sm leading-relaxed text-brand-600">
          When a scraper finds a price that differs from the stored one, it stages a change here. Small,
          expected moves (a first price, a drop or rise within the thresholds in <span className="font-medium">Settings</span>)
          are auto-approved and published immediately. Larger jumps — and <span className="font-medium">every</span> change
          from a <span className="font-medium">LOW-trust</span> vendor — land here as <span className="font-medium">Pending</span> for
          you to <span className="font-medium text-success-700">Approve</span> or <span className="font-medium text-red-600">Reject</span>.
          Approving publishes the new price to the live offering; <span className="font-medium">rejecting changes nothing</span> —
          the live price was never touched, so it just stays whatever it already was (shown as
          &quot;Old Price&quot; below). You can also edit the New Price before approving, if the scraper
          caught a stale sale price or you spot-checked the vendor and it&apos;s already different.
        </p>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`admin-btn admin-btn-sm ${tab === t ? '' : 'admin-btn-ghost'}`}
          >
            {t === 'All' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
        {selected.size > 0 && (
          <div className="ml-auto flex gap-2">
            <button onClick={() => handleAction('approve', [...selected])} className="admin-btn admin-btn-success">
              Approve ({selected.size})
            </button>
            <button onClick={() => handleAction('reject', [...selected])} className="admin-btn admin-btn-danger">
              Reject ({selected.size})
            </button>
          </div>
        )}
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className="p-3"><input type="checkbox" checked={selected.size === changes.length && changes.length > 0} onChange={toggleAll} /></th>
              <th className="p-3">Test</th>
              <th className="p-3">Vendor</th>
              <th className="p-3 text-right">Old Price</th>
              <th className="p-3 text-right">New Price</th>
              <th className="p-3 text-right">% Change</th>
              <th className="p-3">Date</th>
              <th className="p-3">Status</th>
              <th className="sticky right-0 z-10 border-l border-brand-100 bg-brand-50 p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-brand-400">Loading...</td></tr>
            ) : loadError ? (
              <tr><td colSpan={9} className="p-6 text-center text-red-600">{loadError} <button className="ml-2 underline" onClick={fetchChanges}>Retry</button></td></tr>
            ) : changes.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-brand-400">No changes found.</td></tr>
            ) : (
              changes.map((c) => {
                const draftPrice = priceDrafts[c.id];
                const effectivePrice = draftPrice !== undefined && draftPrice !== '' ? draftPrice : c.newPrice;
                const overridden = draftPrice !== undefined && draftPrice !== '' && Number(draftPrice) !== Number(c.newPrice);
                const pct = pctChange(c.oldPrice, effectivePrice);
                return (
                  <tr key={c.id} className="group border-b border-brand-100 hover:bg-brand-50/50">
                    <td className="p-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                    <td className="p-3 font-medium text-brand-900">{c.offering.test.name}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {c.offering.externalUrl || c.offering.vendor.websiteUrl ? (
                          <a
                            href={(c.offering.externalUrl ?? c.offering.vendor.websiteUrl)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 underline decoration-dotted underline-offset-2 hover:text-brand-800"
                            title="Open the vendor's page for this test to verify the price"
                          >
                            {c.offering.vendor.name} ↗
                          </a>
                        ) : (
                          <span className="text-brand-600">{c.offering.vendor.name}</span>
                        )}
                        <button
                          onClick={() => { setEditingUrl(c.id); setUrlDrafts((d) => ({ ...d, [c.id]: c.offering.externalUrl ?? '' })); }}
                          className="text-xs text-brand-300 hover:text-brand-600"
                          title="Fix this vendor's product URL — independent of approving/rejecting the price"
                        >
                          ✎
                        </button>
                      </div>
                      {editingUrl === c.id && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <input
                            type="text"
                            autoFocus
                            className="admin-input admin-input-inline w-64"
                            placeholder="https://vendor.com/product/..."
                            value={urlDrafts[c.id] ?? ''}
                            onChange={(e) => setUrlDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveUrl(c);
                              if (e.key === 'Escape') setEditingUrl(null);
                            }}
                          />
                          <button onClick={() => saveUrl(c)} disabled={urlSaving === c.id} className="admin-btn admin-btn-sm">
                            {urlSaving === c.id ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingUrl(null)} className="admin-btn admin-btn-sm admin-btn-ghost">Cancel</button>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right text-brand-600">{c.oldPrice ? `$${Number(c.oldPrice).toFixed(2)}` : '—'}</td>
                    <td className="p-3 text-right font-medium text-brand-900">
                      {c.status === 'PENDING' ? (
                        <div className="flex items-center justify-end gap-1">
                          <span>$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className={`admin-input admin-input-inline w-20 text-right ${overridden ? 'border-amber-400' : ''}`}
                            value={draftPrice ?? c.newPrice}
                            onChange={(e) => setPriceDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                            title={overridden ? `Scraper saw $${Number(c.newPrice).toFixed(2)} — you're overriding it` : 'Scraped price — edit to override before approving'}
                          />
                        </div>
                      ) : (
                        `$${Number(c.newPrice).toFixed(2)}`
                      )}
                    </td>
                    <td className={`p-3 text-right font-medium ${pct === null ? '' : pct < 0 ? 'text-success-700' : 'text-red-600'}`}>
                      {pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                    </td>
                    <td className="p-3 text-brand-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                        c.status === 'APPROVED' || c.status === 'AUTO_APPROVED' ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-700'
                      }`}>{c.status}</span>
                    </td>
                    <td className="sticky right-0 z-10 border-l border-brand-100 bg-white p-3 group-hover:bg-brand-50/50">
                      {c.status === 'PENDING' ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleAction('approve', [c.id], overridden ? Number(draftPrice) : undefined)}
                            className="admin-btn admin-btn-sm admin-btn-success"
                            title={overridden ? `Publishes your override of $${Number(draftPrice).toFixed(2)}` : 'Publishes the scraped price to the live offering'}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction('reject', [c.id])}
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            title={`Leaves the current price unchanged (stays ${c.oldPrice ? `$${Number(c.oldPrice).toFixed(2)}` : 'as-is'})`}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        // Nothing to do — already resolved. An empty cell here (especially with the
                        // sticky column's left border) reads as broken, so say so explicitly instead.
                        <span className="text-brand-300" title={`Already ${c.status.toLowerCase().replace('_', ' ')} — no action needed.`}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {(pageIndex > 0 || nextCursor) && (
        <div className="mt-4 flex items-center justify-between">
          <button className="admin-btn admin-btn-sm" disabled={pageIndex === 0} onClick={goPrev}>
            ← Prev
          </button>
          <span className="text-sm text-brand-400">Page {pageIndex + 1}</span>
          <button className="admin-btn admin-btn-sm" disabled={!nextCursor} onClick={goNext}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
