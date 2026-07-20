'use client';

import { useEffect, useMemo, useState } from 'react';

type Status = 'PENDING' | 'REVIEWED' | 'DISMISSED';
type Kind = 'vendor' | 'test' | 'report';

type VendorSuggestion = {
  id: string;
  vendorName: string;
  vendorUrl: string | null;
  note: string | null;
  email: string | null;
  status: Status;
  createdAt: string;
};

type TestSuggestion = {
  id: string;
  testName: string;
  note: string | null;
  email: string | null;
  status: Status;
  createdAt: string;
};

type ErrorReport = {
  id: string;
  message: string;
  email: string | null;
  status: Status;
  createdAt: string;
  test: { name: string; slug: string };
  offering: { vendor: { name: string } } | null;
};

// Unified row shape so all three suggestion types render through one table instead of three
// separate card grids — the "kind" carries which underlying table + which fields to show.
interface Row {
  id: string;
  kind: Kind;
  title: string;
  titleHref: string | null;
  subtitle: string | null;
  detail: string | null;
  email: string | null;
  status: Status;
  createdAt: string;
}

function toRows(vendors: VendorSuggestion[], tests: TestSuggestion[], reports: ErrorReport[]): Row[] {
  return [
    ...vendors.map((v): Row => ({
      id: v.id, kind: 'vendor', title: v.vendorName, titleHref: v.vendorUrl, subtitle: null,
      detail: v.note, email: v.email, status: v.status, createdAt: v.createdAt,
    })),
    ...tests.map((t): Row => ({
      id: t.id, kind: 'test', title: t.testName, titleHref: null, subtitle: null,
      detail: t.note, email: t.email, status: t.status, createdAt: t.createdAt,
    })),
    ...reports.map((r): Row => ({
      id: r.id, kind: 'report', title: r.test.name, titleHref: `/test/${r.test.slug}`,
      subtitle: r.offering ? r.offering.vendor.name : 'general', detail: r.message,
      email: r.email, status: r.status, createdAt: r.createdAt,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const KIND_LABEL: Record<Kind, string> = { vendor: 'Vendor suggestion', test: 'Test suggestion', report: 'Error report' };
const KIND_BADGE: Record<Kind, string> = {
  vendor: 'bg-sky-100 text-sky-700',
  test: 'bg-violet-100 text-violet-700',
  report: 'bg-amber-100 text-amber-700',
};
const STATUS_TABS: { key: Status | 'ALL'; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'REVIEWED', label: 'Reviewed' },
  { key: 'DISMISSED', label: 'Dismissed' },
  { key: 'ALL', label: 'All' },
];

export default function SuggestionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<Status | 'ALL'>('PENDING');
  const [kindFilter, setKindFilter] = useState<Kind | 'ALL'>('ALL');

  function load() {
    setLoading(true);
    fetch('/api/v1/admin/suggestions')
      .then((r) => r.json())
      .then((j) => setRows(toRows(j.data?.vendors ?? [], j.data?.tests ?? [], j.data?.reports ?? [])))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { PENDING: 0, REVIEWED: 0, DISMISSED: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const filtered = rows.filter(
    (r) => (statusTab === 'ALL' || r.status === statusTab) && (kindFilter === 'ALL' || r.kind === kindFilter),
  );

  async function setStatus(row: Row, status: Status) {
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/suggestions/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: row.kind, status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error?.message ?? 'Could not update the suggestion.');
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
    } catch {
      setError('Could not update the suggestion — try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: Row) {
    if (!confirm(`Permanently delete this ${KIND_LABEL[row.kind].toLowerCase()}? This can't be undone.`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/suggestions/${row.id}?kind=${row.kind}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error?.message ?? 'Could not delete.');
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      setError('Could not delete — try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="admin-h1 mb-1">Suggestions</h1>
      <p className="mb-5 text-sm text-brand-400">
        Vendor/test leads and result-error reports submitted from the site. Dismiss to archive out of
        the default view (reversible), or delete to remove permanently.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-brand-100 bg-brand-50 p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusTab === t.key ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-500 hover:text-brand-800'
              }`}
            >
              {t.label}
              {t.key !== 'ALL' && <span className="ml-1 text-brand-400">{counts[t.key]}</span>}
            </button>
          ))}
        </div>
        <select
          className="admin-input admin-input-inline"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as Kind | 'ALL')}
        >
          <option value="ALL">All types</option>
          <option value="vendor">Vendor suggestions</option>
          <option value="test">Test suggestions</option>
          <option value="report">Error reports</option>
        </select>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className="p-3">Type</th>
              <th className="p-3">Detail</th>
              <th className="p-3">From</th>
              <th className="p-3">Submitted</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-brand-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-brand-400">Nothing here.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-b border-brand-100 align-top hover:bg-brand-50/50">
                  <td className="p-3">
                    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${KIND_BADGE[r.kind]}`}>
                      {KIND_LABEL[r.kind]}
                    </span>
                  </td>
                  <td className="max-w-md p-3">
                    <div className="font-medium text-brand-900">
                      {r.titleHref ? (
                        <a href={r.titleHref} target="_blank" rel="noreferrer" className="underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
                          {r.title}
                        </a>
                      ) : (
                        r.title
                      )}
                      {r.subtitle && <span className="ml-2 font-normal text-brand-500">· {r.subtitle}</span>}
                    </div>
                    {r.detail && <p className="mt-1 text-brand-600">{r.detail}</p>}
                  </td>
                  <td className="p-3 whitespace-nowrap text-brand-400">{r.email ?? '—'}</td>
                  <td className="p-3 whitespace-nowrap text-brand-400">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="p-3">
                    <span
                      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                        r.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-700'
                          : r.status === 'REVIEWED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-brand-100 text-brand-500'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {r.status !== 'REVIEWED' && (
                        <button disabled={busyId === r.id} onClick={() => setStatus(r, 'REVIEWED')} className="admin-btn admin-btn-sm admin-btn-success">
                          Reviewed
                        </button>
                      )}
                      {r.status !== 'DISMISSED' && (
                        <button disabled={busyId === r.id} onClick={() => setStatus(r, 'DISMISSED')} className="admin-btn admin-btn-sm admin-btn-ghost">
                          Dismiss
                        </button>
                      )}
                      <button disabled={busyId === r.id} onClick={() => remove(r)} className="admin-btn admin-btn-sm admin-btn-danger">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
