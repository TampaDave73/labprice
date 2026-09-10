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
// PUBLISHED is derived server-side from the linked post, not stored — see the questions GET route.
type Bucket = Status | 'PUBLISHED';

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
  postSlug: string | null;
  postPublished: boolean;
  bucket: Bucket;
  guidance: string | null;
  capturedAt: string;
}

const TABS: { key: Bucket | 'ALL'; label: string }[] = [
  { key: 'NEW', label: 'New' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'DRAFTED', label: 'Drafted' },
  { key: 'PUBLISHED', label: 'Published' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

export default function AdminQuestionsPage() {
  const [tab, setTab] = useState<Bucket | 'ALL'>('NEW');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [draftLink, setDraftLink] = useState<{ slug: string; title: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [newQ, setNewQ] = useState({ title: '', guidance: '', matchedTests: '' });
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [guidanceDraft, setGuidanceDraft] = useState<Record<string, string>>({});

  const load = (status: Bucket | 'ALL') => {
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
      if (status === 'APPROVED' && tab === 'NEW') {
        setMsg({ text: `Approved. Open the Approved tab to draft an article from it.`, ok: true });
      }
      load(tab);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Update failed', ok: false });
    } finally {
      setBusyId(null);
    }
  }

  async function addQuestion() {
    if (newQ.title.trim().length < 5) {
      setMsg({ text: 'Give the question a few more words.', ok: false });
      return;
    }
    setAdding(true);
    setMsg(null);
    try {
      const res = await fetch('/api/v1/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newQ.title,
          guidance: newQ.guidance,
          matchedTests: newQ.matchedTests.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message ?? 'Could not add that question.');
      setMsg({ text: 'Added, and approved — it is on the Approved tab ready to draft.', ok: true });
      setNewQ({ title: '', guidance: '', matchedTests: '' });
      setShowAdd(false);
      setTab('APPROVED');
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not add that question.', ok: false });
    } finally {
      setAdding(false);
    }
  }

  /** Saves the direction for a candidate without changing its status. */
  async function saveGuidance(c: Candidate) {
    setBusyId(c.id);
    setMsg(null);
    try {
      const res = await fetch('/api/v1/admin/questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, guidance: guidanceDraft[c.id] ?? '' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message ?? 'Could not save that direction.');
      }
      setMsg({ text: 'Direction saved. Draft (or redraft) to apply it.', ok: true });
      load(tab);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not save that direction.', ok: false });
    } finally {
      setBusyId(null);
    }
  }

  // Site-search candidates are noisy by nature, so clearing a screenful has to be one action.
  async function rejectAllVisible() {
    if (!confirm(`Reject all ${candidates.length} questions shown? They stay in the Rejected tab.`)) return;
    setBulkBusy(true);
    setMsg(null);
    try {
      for (const c of candidates) {
        await fetch('/api/v1/admin/questions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: c.id, status: 'REJECTED' }),
        });
      }
      setMsg({ text: `Rejected ${candidates.length} question(s).`, ok: true });
      load(tab);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Bulk reject failed', ok: false });
    } finally {
      setBulkBusy(false);
    }
  }

  async function draft(c: Candidate) {
    setBusyId(c.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/questions/${c.id}/draft`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message ?? 'Draft generation failed');
      setDraftLink({ slug: j.data.slug, title: j.data.title });
      // The candidate is now DRAFTED, so it left whichever tab you were on. Follow it, rather than
      // leaving you looking at an empty list wondering where the draft went.
      setTab('DRAFTED');
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
        Questions worth answering &mdash; harvested from our own zero-result site searches and
        from forums where bloodwork comes up, or added by hand. Nothing here is public. Approve
        one, then &ldquo;Draft article&rdquo; writes an <strong>unpublished</strong> post you
        review and publish at <code>/admin/blog</code>; drafts are never published automatically.
        An article doesn&rsquo;t have to be about a blood test &mdash; anything a reader of a
        lab-testing site would want explained is fair game. If a draft comes out wrong, set a{' '}
        {/* The explicit {' '} is load-bearing: JSX drops the newline between "a" and this tag, which
            rendered as "set adirection". */}
        <em>direction</em> and redraft it.
      </p>

      {/* Your own idea, rather than a harvested one. Adds pre-approved — there is no point making
          you approve your own suggestion — so it lands on the Approved tab ready to draft. */}
      <div className="mb-4">
        {showAdd ? (
          <div className="admin-card p-4">
            <h2 className="admin-h2 mb-3">Add a question</h2>
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-brand-700">
                  The question, as a reader would ask it
                </span>
                <input
                  className="admin-input w-full"
                  value={newQ.title}
                  onChange={(e) => setNewQ({ ...newQ, title: e.target.value })}
                  placeholder="What blood tests do bodybuilders track?"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-brand-700">
                  Direction for the writer (optional) &mdash; the angle to take, what to leave out, who it is for
                </span>
                <textarea
                  className="admin-input w-full"
                  rows={3}
                  value={newQ.guidance}
                  onChange={(e) => setNewQ({ ...newQ, guidance: e.target.value })}
                  placeholder="Focus on which markers people monitor and why, not on training or supplements."
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-brand-700">
                  Related test slugs (optional, comma-separated)
                </span>
                <input
                  className="admin-input w-full"
                  value={newQ.matchedTests}
                  onChange={(e) => setNewQ({ ...newQ, matchedTests: e.target.value })}
                  placeholder="testosterone-total, lipid-panel"
                />
              </label>
            </div>
            <div className="mt-4 flex gap-3">
              <button className="admin-btn" onClick={addQuestion} disabled={adding}>
                {adding ? 'Adding…' : 'Add question'}
              </button>
              <button
                className="admin-btn admin-btn-ghost"
                onClick={() => setShowAdd(false)}
                disabled={adding}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="admin-btn"
            onClick={() => {
              setShowAdd(true);
              setMsg(null);
            }}
          >
            Add a question
          </button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
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
        {tab === 'NEW' && candidates.length > 0 && (
          <button
            className="admin-btn admin-btn-sm admin-btn-ghost ml-auto"
            disabled={bulkBusy}
            onClick={rejectAllVisible}
          >
            {bulkBusy ? 'Rejecting…' : `Reject all ${candidates.length} shown`}
          </button>
        )}
      </div>

      {draftLink && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Draft created: <strong>{draftLink.title}</strong>. It is <strong>not published</strong>.{' '}
          <a className="underline" href={`/blog/${draftLink.slug}`} target="_blank" rel="noopener noreferrer">
            Preview it
          </a>{' '}
          (visible to signed-in admins only, and noindex) or{' '}
          <a className="underline" href="/admin/blog">
            edit and publish it
          </a>
          .
        </div>
      )}

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
          {tab === 'NEW' && (counts.APPROVED || counts.DRAFTED || counts.REJECTED)
            ? 'No new questions to review — everything harvested so far has been triaged.'
            : tab === 'APPROVED'
              ? 'Nothing approved and waiting. Approve a question on the New tab to draft an article from it.'
              : tab === 'DRAFTED'
                ? 'No drafts waiting. Approve a question, then use “Draft article”.'
                : tab === 'PUBLISHED'
                  ? 'Nothing from this queue is live yet. Publish a draft in /admin/blog and it moves here.'
                  : tab === 'REJECTED'
                    ? 'Nothing rejected.'
                    : null}
          {(tab === 'ALL' ||
            (tab === 'NEW' && !counts.APPROVED && !counts.DRAFTED && !counts.PUBLISHED && !counts.REJECTED)) && (
            <>
              Nothing here yet. Run{' '}
              <code>pnpm --filter @labprice/worker exec tsx scripts/harvest-questions.ts</code> to
              populate the queue.
            </>
          )}
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
              {/* Keyed off `bucket`, not `status`. DRAFTED is a stored status; PUBLISHED is derived
                  from the linked post being live, so a row moves itself once you publish in
                  /admin/blog rather than sitting in Drafted forever. */}
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  c.bucket === 'PUBLISHED'
                    ? 'bg-green-100 text-green-800'
                    : c.bucket === 'DRAFTED'
                      ? 'bg-blue-100 text-blue-800'
                      : c.bucket === 'APPROVED'
                        ? 'bg-teal-100 text-teal-800'
                        : c.bucket === 'REJECTED'
                          ? 'bg-neutral-200 text-neutral-700'
                          : 'bg-amber-100 text-amber-800'
                }`}
              >
                {c.bucket}
              </span>

              {/* The label tells the truth about what the link opens: an unpublished draft is only
                  visible to you, behind an admin preview banner. */}
              {c.postSlug && (
                <a
                  className="admin-btn admin-btn-ghost admin-btn-sm"
                  href={`/blog/${c.postSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {c.postPublished ? 'View article' : 'Preview draft'}
                </a>
              )}

              {c.bucket === 'NEW' && (
                <button className="admin-btn admin-btn-sm" disabled={busyId === c.id} onClick={() => setStatus(c, 'APPROVED')}>
                  Approve
                </button>
              )}
              {c.bucket === 'APPROVED' && (
                <button className="admin-btn admin-btn-sm admin-btn-success" disabled={busyId === c.id} onClick={() => draft(c)}>
                  {busyId === c.id ? 'Drafting…' : 'Draft article'}
                </button>
              )}
              {/* Redraft only while the draft is unpublished — the route refuses to replace a live
                  article, and the button shouldn't imply otherwise. */}
              {c.bucket === 'DRAFTED' && (
                <button className="admin-btn admin-btn-sm" disabled={busyId === c.id} onClick={() => draft(c)}>
                  {busyId === c.id ? 'Redrafting…' : 'Redraft'}
                </button>
              )}
              {c.bucket !== 'REJECTED' && c.bucket !== 'PUBLISHED' && (
                <button className="admin-btn admin-btn-sm admin-btn-ghost" disabled={busyId === c.id} onClick={() => setStatus(c, 'REJECTED')}>
                  Reject
                </button>
              )}

              {/* Direction: the lever for a draft that came out wrong. Saved separately from
                  drafting, so you can write it, read it back, then redraft. */}
              {c.bucket !== 'REJECTED' && c.bucket !== 'PUBLISHED' && (
                <div className="mt-2 w-full">
                  <details open={Boolean(c.guidance)}>
                    <summary className="cursor-pointer text-xs text-brand-500">
                      Direction for the writer {c.guidance ? '(set)' : '(none)'}
                    </summary>
                    <div className="mt-2 flex flex-wrap items-start gap-2">
                      <textarea
                        className="admin-input min-w-[280px] flex-1"
                        rows={2}
                        placeholder="e.g. Focus on which markers are tracked and why. Skip supplements."
                        value={guidanceDraft[c.id] ?? c.guidance ?? ''}
                        onChange={(e) => setGuidanceDraft({ ...guidanceDraft, [c.id]: e.target.value })}
                      />
                      <button
                        className="admin-btn admin-btn-sm admin-btn-ghost"
                        disabled={busyId === c.id}
                        onClick={() => saveGuidance(c)}
                      >
                        Save direction
                      </button>
                    </div>
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
