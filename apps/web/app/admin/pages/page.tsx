'use client';

// Editor for the public static pages (About / Terms / Privacy / Medical Disclaimer). Each card edits
// one page's title, "Last updated" label, and body; Save PATCHes /api/v1/admin/pages, which persists
// to system_settings and revalidates the live page. Body uses a tiny convention (see the hint below).
import { useEffect, useState } from 'react';

interface PageRow {
  slug: string;
  label: string;
  title: string;
  updated: string | null;
  body: string;
}

export default function AdminPagesPage() {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ slug: string; text: string; ok: boolean } | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    fetch('/api/v1/admin/pages')
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error?.message ?? 'Could not load pages.');
        setPages(j.data?.pages ?? []);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load pages — try again.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  function update(slug: string, field: keyof PageRow, val: string) {
    setPages((prev) => prev.map((p) => (p.slug === slug ? { ...p, [field]: val } : p)));
  }

  async function save(page: PageRow) {
    setSavingSlug(page.slug);
    setMsg(null);
    try {
      const res = await fetch('/api/v1/admin/pages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: page.slug, title: page.title, updated: page.updated ?? '', body: page.body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message ?? 'Save failed');
      }
      setMsg({ slug: page.slug, text: 'Saved. The live page has been updated.', ok: true });
    } catch (err) {
      setMsg({ slug: page.slug, text: err instanceof Error ? err.message : 'Save failed', ok: false });
    } finally {
      setSavingSlug(null);
    }
  }

  return (
    <div>
      <h1 className="admin-h1 mb-2">Pages</h1>
      <p className="mb-6 text-sm text-brand-500">
        Edit the public About, Terms, Privacy, and Medical Disclaimer pages. Formatting: a blank line
        starts a new paragraph, <code>## </code> at the start of a line makes a heading, and lines
        starting with <code>- </code> become a bullet list.
      </p>

      {loading ? (
        <p className="text-brand-400">Loading…</p>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError} <button className="underline" onClick={load}>Retry</button>
        </div>
      ) : (
        <div className="space-y-6">
          {pages.map((page) => (
            <div key={page.slug} className="admin-card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-brand-700">
                  {page.label} <span className="font-normal text-brand-400">· /{page.slug}</span>
                </h2>
                <a href={`/${page.slug}`} target="_blank" rel="noreferrer" className="text-xs text-brand-500 underline">
                  View live ↗
                </a>
              </div>

              <label className="mb-1 block text-xs font-semibold text-brand-600">Title</label>
              <input
                className="admin-input mb-4 w-full"
                value={page.title}
                onChange={(e) => update(page.slug, 'title', e.target.value)}
              />

              <label className="mb-1 block text-xs font-semibold text-brand-600">
                &ldquo;Last updated&rdquo; label <span className="font-normal text-brand-400">(optional, e.g. July 2026)</span>
              </label>
              <input
                className="admin-input mb-4 w-full"
                value={page.updated ?? ''}
                onChange={(e) => update(page.slug, 'updated', e.target.value)}
              />

              <label className="mb-1 block text-xs font-semibold text-brand-600">Body</label>
              <textarea
                className="admin-input mb-4 w-full font-mono text-[13px] leading-relaxed"
                rows={16}
                value={page.body}
                onChange={(e) => update(page.slug, 'body', e.target.value)}
              />

              <div className="flex items-center gap-3">
                <button className="admin-btn" disabled={savingSlug === page.slug} onClick={() => save(page)}>
                  {savingSlug === page.slug ? 'Saving…' : 'Save'}
                </button>
                {msg?.slug === page.slug && (
                  <span className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
