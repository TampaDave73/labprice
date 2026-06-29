'use client';

import { useEffect, useState } from 'react';

type Flag = { key: string; description: string | null; isEnabled: boolean };

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
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/admin/settings').then((r) => r.json()).then((j) => {
      const stored: Record<string, unknown> = {};
      (j.data?.settings ?? []).forEach((s: { key: string; value: unknown }) => { stored[s.key] = s.value; });
      const v: Record<string, number | boolean> = {};
      for (const f of FIELDS) {
        const raw = stored[f.key];
        if (f.type === 'boolean') v[f.key] = raw === undefined ? (f.default as boolean) : raw === true || raw === 'true';
        else v[f.key] = raw === undefined ? (f.default as number) : Number(raw);
      }
      setValues(v);
      setFlags(j.data?.featureFlags ?? []);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true); setMsg(null);
    await fetch('/api/v1/admin/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: FIELDS.map((f) => ({ key: f.key, value: values[f.key] })),
        featureFlags: flags.map((f) => ({ key: f.key, isEnabled: f.isEnabled })),
      }),
    });
    setSaving(false); setMsg('Settings saved.');
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

      <div className="admin-card max-w-2xl space-y-3 p-6">
        <h2 className="admin-h2">Feature Flags</h2>
        {flags.length === 0 ? (
          <p className="text-sm text-brand-400">No feature flags configured.</p>
        ) : (
          flags.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-6 border-b border-brand-50 pb-3 last:border-0 last:pb-0">
              <div>
                <div className="text-sm font-medium text-brand-900">{f.key}</div>
                {f.description && <div className="mt-0.5 text-xs text-brand-400">{f.description}</div>}
              </div>
              <Toggle on={f.isEnabled} onClick={() => setFlags((prev) => prev.map((x) => (x.key === f.key ? { ...x, isEnabled: !x.isEnabled } : x)))} />
            </div>
          ))
        )}
      </div>

      <button onClick={save} disabled={saving} className="admin-btn">{saving ? 'Saving...' : 'Save All'}</button>
    </div>
  );
}
