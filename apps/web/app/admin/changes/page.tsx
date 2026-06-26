'use client';

import { useCallback, useEffect, useState } from 'react';

type Change = {
  id: string;
  oldPrice: string | null;
  newPrice: string;
  status: string;
  createdAt: string;
  offering: {
    test: { id: string; name: string };
    vendor: { id: string; name: string };
  };
};

const TABS = ['All', 'PENDING', 'APPROVED', 'REJECTED'] as const;

export default function ChangeQueuePage() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [tab, setTab] = useState<string>('All');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchChanges = useCallback(async () => {
    setLoading(true);
    const qs = tab !== 'All' ? `?status=${tab}` : '';
    const res = await fetch(`/api/v1/admin/staged-changes${qs}`);
    const json = await res.json();
    setChanges(json.data ?? []);
    setSelected(new Set());
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchChanges(); }, [fetchChanges]);

  const handleAction = async (action: 'approve' | 'reject', ids: string[]) => {
    await fetch('/api/v1/admin/staged-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids }),
    });
    fetchChanges();
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
      <h1 className="mb-6 text-2xl font-bold text-brand-900">Change Queue</h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'bg-brand-600 text-white' : 'bg-white text-brand-600 border border-brand-200 hover:bg-brand-50'
            }`}
          >
            {t === 'All' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
        {selected.size > 0 && (
          <div className="ml-auto flex gap-2">
            <button onClick={() => handleAction('approve', [...selected])} className="rounded-lg bg-success-500 px-4 py-2 text-sm font-medium text-white hover:bg-success-700">
              Approve ({selected.size})
            </button>
            <button onClick={() => handleAction('reject', [...selected])} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
              Reject ({selected.size})
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
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
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-brand-400">Loading...</td></tr>
            ) : changes.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-brand-400">No changes found.</td></tr>
            ) : (
              changes.map((c) => {
                const pct = pctChange(c.oldPrice, c.newPrice);
                return (
                  <tr key={c.id} className="border-b border-brand-100 hover:bg-brand-50/50">
                    <td className="p-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                    <td className="p-3 font-medium text-brand-900">{c.offering.test.name}</td>
                    <td className="p-3 text-brand-600">{c.offering.vendor.name}</td>
                    <td className="p-3 text-right text-brand-600">{c.oldPrice ? `$${Number(c.oldPrice).toFixed(2)}` : '—'}</td>
                    <td className="p-3 text-right font-medium text-brand-900">${Number(c.newPrice).toFixed(2)}</td>
                    <td className={`p-3 text-right font-medium ${pct === null ? '' : pct < 0 ? 'text-success-700' : 'text-red-600'}`}>
                      {pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                    </td>
                    <td className="p-3 text-brand-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                        c.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-700'
                      }`}>{c.status}</span>
                    </td>
                    <td className="p-3">
                      {c.status === 'PENDING' && (
                        <div className="flex gap-1">
                          <button onClick={() => handleAction('approve', [c.id])} className="rounded bg-success-500 px-2 py-1 text-xs text-white hover:bg-success-700">Approve</button>
                          <button onClick={() => handleAction('reject', [c.id])} className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700">Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
