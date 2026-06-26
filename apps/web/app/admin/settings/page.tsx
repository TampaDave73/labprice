'use client';

import { useEffect, useState } from 'react';

type Setting = { id: string; key: string; value: unknown };
type Flag = { id: string; key: string; description: string | null; isEnabled: boolean };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/v1/admin/settings').then((r) => r.json()).then((j) => {
      setSettings(j.data?.settings ?? []);
      setFlags(j.data?.featureFlags ?? []);
      const vals: Record<string, string> = {};
      (j.data?.settings ?? []).forEach((s: Setting) => { vals[s.key] = JSON.stringify(s.value); });
      setEditedValues(vals);
      setLoading(false);
    });
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    const settingsPayload = Object.entries(editedValues).map(([key, value]) => {
      try { return { key, value: JSON.parse(value) }; } catch { return { key, value }; }
    });
    await fetch('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: settingsPayload, featureFlags: flags.map((f) => ({ key: f.key, isEnabled: f.isEnabled })) }),
    });
    setSaving(false);
  };

  const toggleFlag = (key: string) => {
    setFlags((prev) => prev.map((f) => f.key === key ? { ...f, isEnabled: !f.isEnabled } : f));
  };

  if (loading) return <div className="p-6 text-brand-400">Loading...</div>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-900">Settings</h1>

      <div className="mb-8 rounded-xl border border-brand-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-brand-900">System Settings</h2>
        {settings.length === 0 ? (
          <p className="text-sm text-brand-400">No settings configured.</p>
        ) : (
          <div className="space-y-3">
            {settings.map((s) => (
              <div key={s.key} className="flex items-center gap-4">
                <label className="w-48 shrink-0 text-sm font-medium text-brand-700">{s.key}</label>
                <input type="text" value={editedValues[s.key] ?? ''} onChange={(e) => setEditedValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  className="flex-1 rounded-lg border border-brand-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8 rounded-xl border border-brand-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-brand-900">Feature Flags</h2>
        {flags.length === 0 ? (
          <p className="text-sm text-brand-400">No feature flags configured.</p>
        ) : (
          <div className="space-y-3">
            {flags.map((f) => (
              <div key={f.key} className="flex items-center justify-between rounded-lg border border-brand-100 p-3">
                <div>
                  <p className="text-sm font-medium text-brand-900">{f.key}</p>
                  {f.description && <p className="text-xs text-brand-400">{f.description}</p>}
                </div>
                <button onClick={() => toggleFlag(f.key)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${f.isEnabled ? 'bg-success-500' : 'bg-brand-200'}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${f.isEnabled ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={saveSettings} disabled={saving}
        className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {saving ? 'Saving...' : 'Save All'}
      </button>
    </div>
  );
}
