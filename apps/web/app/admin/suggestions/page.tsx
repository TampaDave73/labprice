'use client';

import { useEffect, useState } from 'react';

type Status = 'PENDING' | 'REVIEWED' | 'DISMISSED';

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

export default function SuggestionsPage() {
  const [vendors, setVendors] = useState<VendorSuggestion[]>([]);
  const [tests, setTests] = useState<TestSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch('/api/v1/admin/suggestions')
      .then((r) => r.json())
      .then((j) => {
        setVendors(j.data?.vendors ?? []);
        setTests(j.data?.tests ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const [error, setError] = useState<string | null>(null);

  async function setStatus(kind: 'vendor' | 'test', id: string, status: Status) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error?.message ?? 'Could not update the suggestion.');
        return;
      }
      load();
    } catch {
      setError('Could not update the suggestion — try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="admin-h1 mb-6">Suggestions</h1>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-brand-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="admin-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-brand-700">Suggested vendors</h2>
            {vendors.length === 0 ? (
              <p className="py-4 text-center text-sm text-brand-400">No vendor suggestions yet.</p>
            ) : (
              <div className="space-y-3">
                {vendors.map((v) => (
                  <div key={v.id} className="rounded-lg border border-brand-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-brand-900">{v.vendorName}</div>
                        {v.vendorUrl && (
                          <a href={v.vendorUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-500 underline">
                            {v.vendorUrl}
                          </a>
                        )}
                        {v.note && <p className="mt-1 text-sm text-brand-600">{v.note}</p>}
                        {v.email && <p className="mt-1 text-xs text-brand-400">from {v.email}</p>}
                        <p className="mt-1 text-xs text-brand-300">{new Date(v.createdAt).toLocaleString()}</p>
                      </div>
                      <StatusControls kind="vendor" id={v.id} status={v.status} busy={busyId === v.id} onChange={setStatus} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-brand-700">Suggested tests</h2>
            {tests.length === 0 ? (
              <p className="py-4 text-center text-sm text-brand-400">No test suggestions yet.</p>
            ) : (
              <div className="space-y-3">
                {tests.map((t) => (
                  <div key={t.id} className="rounded-lg border border-brand-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-brand-900">{t.testName}</div>
                        {t.note && <p className="mt-1 text-sm text-brand-600">{t.note}</p>}
                        {t.email && <p className="mt-1 text-xs text-brand-400">from {t.email}</p>}
                        <p className="mt-1 text-xs text-brand-300">{new Date(t.createdAt).toLocaleString()}</p>
                      </div>
                      <StatusControls kind="test" id={t.id} status={t.status} busy={busyId === t.id} onChange={setStatus} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusControls({
  kind,
  id,
  status,
  busy,
  onChange,
}: {
  kind: 'vendor' | 'test';
  id: string;
  status: Status;
  busy: boolean;
  onChange: (kind: 'vendor' | 'test', id: string, status: Status) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span
        className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
          status === 'PENDING'
            ? 'bg-amber-100 text-amber-700'
            : status === 'REVIEWED'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-brand-100 text-brand-500'
        }`}
      >
        {status}
      </span>
      {status !== 'REVIEWED' && (
        <button disabled={busy} onClick={() => onChange(kind, id, 'REVIEWED')} className="admin-btn admin-btn-sm">
          Mark reviewed
        </button>
      )}
      {status !== 'DISMISSED' && (
        <button disabled={busy} onClick={() => onChange(kind, id, 'DISMISSED')} className="admin-btn admin-btn-sm admin-btn-ghost">
          Dismiss
        </button>
      )}
    </div>
  );
}
