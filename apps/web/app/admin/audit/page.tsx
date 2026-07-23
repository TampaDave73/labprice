'use client';

// /admin/audit — the searchable audit trail. Answers "what happened to Test X" / "what did user Y
// change last month" with entity/actor/action/date filters + pagination, instead of the dashboard's
// scroll-only 20-row feed. Rows are humanized via the same describeAuditRow used by the dashboard.
import { useCallback, useEffect, useState } from 'react';
import { describeAuditRow, type AuditRow } from '@/lib/audit-describe';

type ApiRow = AuditRow & { createdAt: string };

type Meta = {
  actions: string[];
  entityTypes: string[];
  actors: { id: string; name: string | null; email: string }[];
  hasSystemActor: boolean;
};

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [rows, setRows] = useState<ApiRow[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Meta>({ actions: [], entityTypes: [], actors: [], hasSystemActor: false });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (action) params.set('action', action);
      if (entityType) params.set('entityType', entityType);
      if (actorId) params.set('actorId', actorId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/v1/admin/audit?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message ?? 'Could not load the audit log.');
      setRows(json.data ?? []);
      setLabels(json.labels ?? {});
      setMeta(json.meta ?? { actions: [], entityTypes: [], actors: [], hasSystemActor: false });
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the audit log — try again.');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, action, entityType, actorId, from, to]);

  useEffect(() => { load(); }, [load]);

  // Any filter change restarts from page 1 — a stale high page number against a narrower result set
  // would silently show an empty table.
  const applyFilter = (setter: (v: string) => void) => (v: string) => { setter(v); setPage(1); };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectCls = 'admin-input mt-1 block max-w-48 text-sm';
  const actionLabel = (a: string) => a.replace(/[._]/g, ' ');

  return (
    <div>
      <h1 className="admin-h1 mb-6">Audit Log</h1>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block text-xs text-brand-400">
          Action
          <select className={selectCls} value={action} onChange={(e) => applyFilter(setAction)(e.target.value)}>
            <option value="">All actions</option>
            {meta.actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
        </label>
        <label className="block text-xs text-brand-400">
          Entity
          <select className={selectCls} value={entityType} onChange={(e) => applyFilter(setEntityType)(e.target.value)}>
            <option value="">All entities</option>
            {meta.entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block text-xs text-brand-400">
          Actor
          <select className={selectCls} value={actorId} onChange={(e) => applyFilter(setActorId)(e.target.value)}>
            <option value="">All actors</option>
            {meta.hasSystemActor && <option value="system">System (scraper)</option>}
            {meta.actors.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.email}</option>)}
          </select>
        </label>
        <label className="block text-xs text-brand-400">
          From
          <input type="date" className={selectCls} value={from} onChange={(e) => applyFilter(setFrom)(e.target.value)} />
        </label>
        <label className="block text-xs text-brand-400">
          To
          <input type="date" className={selectCls} value={to} onChange={(e) => applyFilter(setTo)(e.target.value)} />
        </label>
        {(action || entityType || actorId || from || to) && (
          <button
            className="admin-btn text-sm"
            onClick={() => { setAction(''); setEntityType(''); setActorId(''); setFrom(''); setTo(''); setPage(1); }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className="p-3">When</th>
              <th className="p-3">What</th>
              <th className="p-3">Entity</th>
              <th className="p-3">Actor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-6 text-center text-brand-400">Loading...</td></tr>
            ) : error ? (
              <tr><td colSpan={4} className="p-6 text-center text-red-600">{error} <button className="ml-2 underline" onClick={load}>Retry</button></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-brand-400">No audit entries match these filters.</td></tr>
            ) : (
              rows.map((log) => {
                const { title, detail } = describeAuditRow(log, labels[log.entityId] ?? null);
                return (
                  <tr key={log.id} className="border-b border-brand-100 hover:bg-brand-50/50">
                    <td className="whitespace-nowrap p-3 text-brand-400">
                      {new Date(log.createdAt).toLocaleString(undefined, { year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td className="p-3">
                      <p className="text-brand-900">{title}</p>
                      {detail && <p className="text-xs text-brand-400">{detail}</p>}
                    </td>
                    <td className="p-3 text-brand-600">
                      {labels[log.entityId] ?? <span className="font-mono text-xs text-brand-400">{log.entityType}#{log.entityId.slice(-8)}</span>}
                    </td>
                    <td className="p-3 text-brand-600">{log.actor?.name ?? log.actor?.email ?? <span className="text-brand-400">system</span>}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-brand-600">
        <span>{total} entr{total === 1 ? 'y' : 'ies'}</span>
        <div className="flex items-center gap-3">
          <button className="admin-btn text-sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>← Newer</button>
          <span className="text-brand-400">Page {page} of {totalPages}</span>
          <button className="admin-btn text-sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Older →</button>
        </div>
      </div>
    </div>
  );
}
