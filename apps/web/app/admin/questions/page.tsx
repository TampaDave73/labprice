'use client';

// Review queue for harvested question candidates (apps/worker/scripts/harvest-questions.ts).
//
// Approve a question you want written, reject the rest, and "Draft article" turns one into an
// unpublished post you then read and publish at /admin/blog. Nothing here can publish anything.
//
// Fetches check `res.ok` before touching `j.data` and resolve their loading flag in `finally`
// (CLAUDE.md gotcha 10).
import { useEffect, useState } from 'react';

type Status = 'NEW' | 'APPROVED' | 'REJECTED' | 'DRAFTED';

interface Candidate {
  id: string;
  source: 'REDDIT' | 'SEARCH_LOG' | 'MANUAL';
  sourceUrl: string | null;
  origin: string | null;
  title: string;
  score: number;
  matchedTests: string[];
  status: Status;
  postId: string | null;
  capturedAt: string;
}

const TABS: { key: Status | 'ALL'; label: string }[] = [
  { key: 'NEW', label: 'New' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'DRAFTED', label: 'Drafted' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

export default function AdminQuestionsPage() {
  const [tab, setTab] = useState<Status | 'ALL'>('NEW');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = (status: Status | 'ALL') => {
    setLoading(true);
    setLoadError(null);
    fetch(`/api/v1/admin/questions?status=${status}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error?.message ?? 'Could not load the queue.');
        setCandidates(j.data?.candidates ?? []);
        setCounts(j.data?.counts ?? {});
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load the queue — try again.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(tab), [tab]);

  async function setStatus(c: Candidate, status: Status) {
    setBusyId(c.id);
    setMsg(null);
    try {
      const res = await fetch('/api/v1/admin/questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message ?? 'Update failed');
      }
      load(tab);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Update failed', ok: false });
    } finally {
      setBusyId(null);
    }
  }

  async function draft(c: Candidate) {
    setBusyId(c.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/questions/${c.id}/draft`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message ?? 'Draft generation failed');
      setMsg({ text: `Draft created: "${j.data.title}". Read and publish it at /admin/blog.`, ok: true });
      load(tab);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Draft generation failed', ok: false });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="admin-h1 mb-2">Question research</h1>
      <p className="mb-5 max-w-3xl text-sm text-brand-500">
        Questions people are asking, harvested from our own zero-result site searches and from forums
        where bloodwork comes up. Nothing here is public. Approve the ones worth writing, then
        &ldquo;Draft article&rdquo; creates an <strong>unpublished</strong> post you review and publish
        at <code>/admin/blog</code> — drafts are never published automatically.
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`admin-btn admin-btn-sm ${tab === t.key ? '' : 'admin-btn-ghost'}`}
          >
            {t.label}
            {counts[t.key] != null ? ` (${counts[t.key]})` : ''}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${msg.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <p className="text-brand-400">Loading…</p>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}{' '}
          <button className="underline" onClick={() => load(tab)}>
            Retry
          </button>
        </div>
      ) : candidates.length === 0 ? (
        <p className="text-brand-400">
          Nothing here yet. Run{' '}
          <code>pnpm --filter @labprice/worker exec tsx scripts/harvest-questions.ts</code> to populate
          the queue.
        </p>
      ) : (
        <div className="admin-card divide-y">
          {candidates.map((c) => (
            <div key={c.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-[280px] flex-1">
                <div className="font-medium text-brand-900">{c.title}</div>
                <div className="mt-1 text-xs text-brand-500">
                  {c.origin ?? c.source} · score {c.score}
                  {c.matchedTests.length > 0 && <> · tests: {c.matchedTests.join(', ')}</>}
                  {c.sourceUrl && (
                    <>
                      {' · '}
                      <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                        thread
                      </a>
                    </>
                  )}
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  c.status === 'DRAFTED'
                    ? 'bg-blue-100 text-blue-800'
                    : c.status === 'APPROVED'
                      ? 'bg-green-100 text-green-800'
                      : c.status === 'REJECTED'
                        ? 'bg-neutral-200 text-neutral-700'
                        : 'bg-amber-100 text-amber-800'
                }`}
              >
                {c.status}
              </span>
              {c.status !== 'DRAFTED' && (
                <>
                  {c.status !== 'APPROVED' && (
                    <button className="admin-btn admin-btn-sm" disabled={busyId === c.id} onClick={() => setStatus(c, 'APPROVED')}>
                      Approve
                    </button>
                  )}
                  {c.status === 'APPROVED' && (
                    <button className="admin-btn admin-btn-sm admin-btn-success" disabled={busyId === c.id} onClick={() => draft(c)}>
                      {busyId === c.id ? 'Drafting…' : 'Draft article'}
                    </button>
                  )}
                  {c.status !== 'REJECTED' && (
                    <button className="admin-btn admin-btn-sm admin-btn-ghost" disabled={busyId === c.id} onClick={() => setStatus(c, 'REJECTED')}>
                      Reject
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
