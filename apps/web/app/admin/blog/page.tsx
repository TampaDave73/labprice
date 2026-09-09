'use client';

// Blog editor. Lists posts, and edits one at a time in an inline form — same shape as /admin/pages,
// which is the closest existing analogue.
//
// Every fetch checks `res.ok` before touching `j.data` and resolves its loading flag in `finally`
// (CLAUDE.md gotcha 10) — the bare `.then(j => setX(j.data))` pattern is what left other admin pages
// stuck on "Loading…" forever.
import { useEffect, useState } from 'react';

interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string;
  heroUrl: string | null;
}

interface PostFull extends PostRow {
  body: string;
  heroAlt: string | null;
  heroCredit: string | null;
  faq: string | null;
  relatedTests: string[];
}

const EMPTY: PostFull = {
  id: '', slug: '', title: '', excerpt: '', body: '', author: 'Dave S.',
  heroUrl: null, heroAlt: null, heroCredit: null, faq: null, relatedTests: [],
  isPublished: false, publishedAt: null, updatedAt: '',
};

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<PostFull | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    fetch('/api/v1/admin/posts')
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error?.message ?? 'Could not load posts.');
        setPosts(j.data?.posts ?? []);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load posts — try again.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  async function openPost(id: string) {
    setMsg(null);
    try {
      const r = await fetch(`/api/v1/admin/posts/${id}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error?.message ?? 'Could not open that post.');
      setEditing({ ...j.data.post, relatedTests: j.data.post.relatedTests ?? [] });
      setIsNew(false);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not open that post.', ok: false });
    }
  }

  function set<K extends keyof PostFull>(field: K, val: PostFull[K]) {
    setEditing((p) => (p ? { ...p, [field]: val } : p));
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        slug: editing.slug,
        title: editing.title,
        excerpt: editing.excerpt,
        body: editing.body,
        author: editing.author,
        heroUrl: editing.heroUrl ?? '',
        heroAlt: editing.heroAlt ?? '',
        heroCredit: editing.heroCredit ?? '',
        faq: editing.faq ?? '',
        relatedTests: editing.relatedTests,
        isPublished: editing.isPublished,
      };
      const res = await fetch(isNew ? '/api/v1/admin/posts' : `/api/v1/admin/posts/${editing.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message ?? 'Save failed');
      setMsg({ text: `Saved. ${editing.isPublished ? 'Live at' : 'Draft — not published. Preview at'} /blog/${editing.slug}`, ok: true });
      setEditing(null);
      load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Save failed', ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function remove(post: PostRow) {
    // Soft delete server-side, but it does unpublish immediately — worth one confirmation.
    if (!confirm(`Delete "${post.title}"? It will be unpublished immediately.`)) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/posts/${post.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message ?? 'Delete failed');
      }
      setMsg({ text: `Deleted "${post.title}".`, ok: true });
      load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Delete failed', ok: false });
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="admin-h1">Blog</h1>
        {!editing && (
          <button className="admin-btn" onClick={() => { setEditing({ ...EMPTY }); setIsNew(true); setMsg(null); }}>
            New post
          </button>
        )}
      </div>
      <p className="mb-6 text-sm text-brand-500">
        Articles at <code>/blog</code>. Body formatting: blank line between blocks, <code>## </code> and{' '}
        <code>### </code> headings, <code>- </code> or <code>1. </code> lists, <code>| a | b |</code>{' '}
        tables, <code>&gt; </code> callouts, <code>**bold**</code>, <code>[text](/test/slug)</code> links,
        and <code>[FIG:name]</code> for a diagram (<code>draw-steps</code>, <code>fasting-clock</code>,{' '}
        <code>lipid-breakdown</code>, <code>cmp-groups</code>, <code>selfpay-vs-insurance</code>).
      </p>

      {msg && (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${msg.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {editing ? (
        <div className="admin-card p-5">
          <h2 className="admin-h2 mb-4">{isNew ? 'New post' : `Editing: ${editing.title || editing.slug}`}</h2>
          <div className="grid gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-700">Title</span>
              <input className="admin-input w-full" value={editing.title} onChange={(e) => set('title', e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-700">Slug (URL)</span>
              <input className="admin-input w-full" value={editing.slug} onChange={(e) => set('slug', e.target.value)} placeholder="how-a-blood-draw-works" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-700">
                Excerpt — also the meta description, and shown as the article&rsquo;s opening answer
              </span>
              <textarea className="admin-input w-full" rows={3} value={editing.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-700">Body</span>
              <textarea className="admin-input w-full font-mono text-[13px]" rows={22} value={editing.body} onChange={(e) => set('body', e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-700">
                FAQ — <code>Q:</code> / <code>A:</code> lines. Rendered on the page and emitted as FAQ structured data.
              </span>
              <textarea className="admin-input w-full font-mono text-[13px]" rows={8} value={editing.faq ?? ''} onChange={(e) => set('faq', e.target.value)} />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-brand-700">Hero image URL</span>
                <input className="admin-input w-full" value={editing.heroUrl ?? ''} onChange={(e) => set('heroUrl', e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-brand-700">Hero alt text</span>
                <input className="admin-input w-full" value={editing.heroAlt ?? ''} onChange={(e) => set('heroAlt', e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-brand-700">Hero credit</span>
                <input className="admin-input w-full" value={editing.heroCredit ?? ''} onChange={(e) => set('heroCredit', e.target.value)} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-brand-700">Author</span>
                <input className="admin-input w-full" value={editing.author} onChange={(e) => set('author', e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-brand-700">
                  Related test slugs (comma-separated) — shown as &ldquo;compare prices&rdquo; cards
                </span>
                <input
                  className="admin-input w-full"
                  value={editing.relatedTests.join(', ')}
                  onChange={(e) => set('relatedTests', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  placeholder="lipid-panel, hemoglobin-a1c"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-brand-700">
              <input type="checkbox" checked={editing.isPublished} onChange={(e) => set('isPublished', e.target.checked)} />
              Published (visible at /blog and in the sitemap)
            </label>
          </div>
          <div className="mt-5 flex gap-3">
            <button className="admin-btn" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => { setEditing(null); setMsg(null); }} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : loading ? (
        <p className="text-brand-400">Loading…</p>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}{' '}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </div>
      ) : posts.length === 0 ? (
        <p className="text-brand-400">No posts yet.</p>
      ) : (
        <div className="admin-card divide-y">
          {posts.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-[240px] flex-1">
                <div className="font-medium text-brand-900">{p.title}</div>
                <div className="text-xs text-brand-500">
                  /blog/{p.slug} · {p.author}
                  {p.publishedAt ? ` · ${new Date(p.publishedAt).toLocaleDateString()}` : ''}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.isPublished ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                {p.isPublished ? 'Published' : 'Draft'}
              </span>
              <a className="admin-btn admin-btn-ghost admin-btn-sm" href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer">
                View
              </a>
              <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => openPost(p.id)}>
                Edit
              </button>
              <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => remove(p)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
