'use client';

import { useEffect, useState } from 'react';

type FieldDef = {
  key: string;
  label: string;
  type: 'number' | 'boolean';
  group: string;
  default: number | boolean;
  help?: string;
};

const FIELDS: FieldDef[] = [
  { key: 'scrape_enabled', label: 'Scraping enabled', type: 'boolean', default: true, group: 'Scraping', help: 'Master switch — when off, no scrapers run.' },
  { key: 'scrape_interval_hours', label: 'Scrape interval (hours)', type: 'number', default: 24, group: 'Scraping', help: 'How often the scheduler kicks off a full scrape pass.' },
  { key: 'scrape_default_timeout_ms', label: 'Default request timeout (ms)', type: 'number', default: 30000, group: 'Scraping', help: 'Per-page fetch timeout when a vendor has no override.' },
  { key: 'auto_approve_decrease_percent', label: 'Auto-approve price drops up to (%)', type: 'number', default: 20, group: 'Auto-approval', help: 'Price decreases within this percent publish automatically; larger drops go to the Change Queue.' },
  { key: 'auto_approve_increase_percent', label: 'Auto-approve price increases up to (%)', type: 'number', default: 5, group: 'Auto-approval', help: 'Price increases within this percent publish automatically; larger increases go to the Change Queue.' },
];

const GROUPS = ['Scraping', 'Auto-approval'];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, number | boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetch('/api/v1/admin/settings').then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error?.message ?? 'Could not load settings.');
      return j;
    }).then((j) => {
      const stored: Record<string, unknown> = {};
      (j.data?.settings ?? []).forEach((s: { key: string; value: unknown }) => { stored[s.key] = s.value; });
      const v: Record<string, number | boolean> = {};
      for (const f of FIELDS) {
        const raw = stored[f.key];
        if (f.type === 'boolean') v[f.key] = raw === undefined ? (f.default as boolean) : raw === true || raw === 'true';
        else v[f.key] = raw === undefined ? (f.default as number) : Number(raw);
      }
      setValues(v);
    }).catch((e) => setMsg(e instanceof Error ? e.message : 'Could not load settings — reload the page to retry.'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: FIELDS.map((f) => ({ key: f.key, value: values[f.key] })),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error?.message ?? 'Could not save settings.');
        return;
      }
      setMsg('Settings saved.');
    } catch {
      setMsg('Could not save settings — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  // Danger zone: wipe all traffic analytics. Native confirm() is enough friction — the wipe is
  // scoped to traffic counters (never prices/scrape history) and audit-logged server-side.
  const resetAnalytics = async () => {
    if (!confirm('Reset ALL analytics? This permanently deletes every search log, vendor click, and page view. Prices and scrape history are NOT affected.')) return;
    setResetting(true); setMsg(null);
    const res = await fetch('/api/v1/admin/analytics/reset', { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setResetting(false);
    if (res.ok) {
      const d = j.data ?? {};
      setMsg(`Analytics reset — deleted ${d.searches ?? 0} searches, ${d.clicks ?? 0} clicks, ${d.pageViews ?? 0} page views.`);
    } else {
      setMsg(j.error?.message ?? 'Could not reset analytics.');
    }
  };

  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button onClick={onClick} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-success-500' : 'bg-brand-200'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  );

  if (loading) return <div className="p-6 text-brand-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="admin-h1">Settings</h1>
        {msg && <span className="text-sm text-success-700">{msg}</span>}
      </div>

      {GROUPS.map((group) => (
        <div key={group} className="admin-card max-w-2xl space-y-4 p-6">
          <h2 className="admin-h2">{group}</h2>
          {FIELDS.filter((f) => f.group === group).map((f) => (
            <div key={f.key} className="flex items-start justify-between gap-6 border-b border-brand-50 pb-4 last:border-0 last:pb-0">
              <div>
                <div className="text-sm font-medium text-brand-900">{f.label}</div>
                {f.help && <div className="mt-0.5 text-xs text-brand-400">{f.help}</div>}
              </div>
              {f.type === 'boolean' ? (
                <Toggle on={values[f.key] as boolean} onClick={() => setValues((p) => ({ ...p, [f.key]: !(p[f.key] as boolean) }))} />
              ) : (
                <input type="number" className="admin-input shrink-0" style={{ width: 110 }} value={values[f.key] as number}
                  onChange={(e) => setValues((p) => ({ ...p, [f.key]: Number(e.target.value) }))} />
              )}
            </div>
          ))}
        </div>
      ))}

      <button onClick={save} disabled={saving} className="admin-btn">{saving ? 'Saving...' : 'Save All'}</button>

      <div className="admin-card max-w-2xl space-y-3 border-red-200 p-6">
        <h2 className="admin-h2 text-red-700">Danger zone</h2>
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-sm font-medium text-brand-900">Reset all analytics</div>
            <div className="mt-0.5 text-xs text-brand-400">
              Permanently deletes every search log, vendor click, and page view — the Analytics page starts from zero.
              Prices, price history, and scrape history are untouched.
            </div>
          </div>
          <button
            onClick={resetAnalytics}
            disabled={resetting}
            className="shrink-0 rounded-btn bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {resetting ? 'Resetting…' : 'Reset analytics'}
          </button>
        </div>
      </div>
    </div>
  );
}
