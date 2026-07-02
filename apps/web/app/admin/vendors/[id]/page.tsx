'use client';

// Vendor editor. Five sections, each saving independently: Details (+ trust override), Catalog
// (test<->vendor links with product URL/price), Scraper Health (read-only computed trust metrics),
// and Scraper Configuration (+ a "Scrape now" trigger). Effective trust = override ?? computed.
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type TrustLevel = 'LOW' | 'MEDIUM' | 'HIGH';

type TrustMetrics = {
  totalRuns: number;
  successRate: number;
  lastSuccessAt: string | null;
  daysSinceSuccess: number | null;
  rejectRate: number;
  score: number;
  computed: TrustLevel;
  hasData: boolean;
};

type VendorData = {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  affiliateUrlTemplate: string | null;
  logoUrl: string | null;
  isActive: boolean;
  trustOverride: TrustLevel | null;
  effectiveTrust: TrustLevel;
  trust: TrustMetrics;
};

type CatalogItem = {
  id: string;
  testId: string;
  testName: string;
  externalUrl: string | null;
  currentPrice: number | null;
  isActive: boolean;
};

type ConfigForm = {
  engine: 'PLAYWRIGHT' | 'SELENIUM' | 'HTTP';
  baseUrl: string;
  catalogMode: boolean;
  catalogAdapter: string;
  catalogPath: string;
  priceSelector: string;
  nameSelector: string;
  containerSelector: string;
  scheduleCron: string;
  isEnabled: boolean;
  timeoutMs: number;
  maxRetries: number;
};

const DEFAULT_CONFIG: ConfigForm = {
  engine: 'HTTP', baseUrl: '', catalogMode: false, catalogAdapter: 'goodlabs', catalogPath: '', priceSelector: '', nameSelector: '', containerSelector: '',
  scheduleCron: '', isEnabled: true, timeoutMs: 30000, maxRetries: 3,
};

const TRUST_BADGE: Record<TrustLevel, string> = {
  HIGH: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-red-100 text-red-700',
};

const labelCls = 'mb-1 block text-sm font-medium text-brand-700';

export default function VendorEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const [vendor, setVendor] = useState<VendorData | null>(null);
  const [config, setConfig] = useState<ConfigForm>(DEFAULT_CONFIG);
  const [savingVendor, setSavingVendor] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Catalog (test↔vendor links)
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [availableTests, setAvailableTests] = useState<{ id: string; name: string }[]>([]);
  const [newTestId, setNewTestId] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const loadCatalog = async () => {
    const j = await fetch(`/api/v1/admin/vendors/${id}/offerings`).then((r) => r.json());
    setCatalog(j.data?.offerings ?? []);
    setAvailableTests(j.data?.availableTests ?? []);
  };
  useEffect(() => { loadCatalog(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLink = async () => {
    if (!newTestId) return;
    await fetch(`/api/v1/admin/vendors/${id}/offerings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testId: newTestId, externalUrl: newUrl || null, currentPrice: newPrice || null }),
    });
    setNewTestId(''); setNewUrl(''); setNewPrice('');
    loadCatalog();
  };

  const saveLink = async (offeringId: string, patch: { externalUrl?: string; currentPrice?: string }) => {
    await fetch(`/api/v1/admin/vendors/${id}/offerings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offeringId, ...patch }),
    });
  };

  const unlink = async (offeringId: string) => {
    await fetch(`/api/v1/admin/vendors/${id}/offerings?offeringId=${offeringId}`, { method: 'DELETE' });
    loadCatalog();
  };

  useEffect(() => {
    fetch(`/api/v1/admin/vendors/${id}`).then((r) => r.json()).then((j) => {
      setVendor(j.data);
      const c = j.data?.scrapeConfig;
      if (c) {
        const sel = c.selectors ?? {};
        setConfig({
          engine: c.engine ?? 'HTTP',
          baseUrl: c.baseUrl ?? '',
          catalogMode: sel.mode === 'catalog',
          catalogAdapter: sel.adapter ?? 'goodlabs',
          catalogPath: sel.catalogPath ?? '',
          priceSelector: sel.priceSelector ?? '',
          nameSelector: sel.nameSelector ?? '',
          containerSelector: sel.containerSelector ?? '',
          scheduleCron: c.scheduleCron ?? '',
          isEnabled: c.isEnabled ?? true,
          timeoutMs: c.timeoutMs ?? 30000,
          maxRetries: c.maxRetries ?? 3,
        });
      }
    });
  }, [id]);

  const setV = (field: keyof VendorData, value: unknown) => setVendor((p) => (p ? { ...p, [field]: value } : p));
  const setC = (field: keyof ConfigForm, value: unknown) => setConfig((p) => ({ ...p, [field]: value }));

  const saveVendor = async () => {
    if (!vendor) return;
    setSavingVendor(true); setMsg(null);
    await fetch(`/api/v1/admin/vendors/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: vendor.name, slug: vendor.slug, websiteUrl: vendor.websiteUrl,
        affiliateUrlTemplate: vendor.affiliateUrlTemplate, logoUrl: vendor.logoUrl,
        isActive: vendor.isActive, trustOverride: vendor.trustOverride,
      }),
    });
    setSavingVendor(false); setMsg('Vendor saved.');
    // refresh effective trust
    const j = await fetch(`/api/v1/admin/vendors/${id}`).then((r) => r.json());
    setVendor((p) => (p ? { ...p, effectiveTrust: j.data.effectiveTrust, trust: j.data.trust } : p));
  };

  const saveConfig = async () => {
    setSavingConfig(true); setMsg(null);
    // Map the catalogMode checkbox to the `mode` the API persists into selectors.
    await fetch(`/api/v1/admin/vendors/${id}/scrape-config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, mode: config.catalogMode ? 'catalog' : 'per-url', adapter: config.catalogAdapter }),
    });
    setSavingConfig(false); setMsg('Scraper config saved.');
  };

  const [scraping, setScraping] = useState(false);
  const runScrape = async () => {
    setScraping(true); setMsg(null);
    const res = await fetch(`/api/v1/admin/vendors/${id}/scrape`, { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setScraping(false);
    if (!res.ok) {
      setMsg(j.error?.message ?? 'Could not start scrape.');
    } else if (j.data?.mode === 'catalog') {
      const d = j.data;
      setMsg(`Scraped ${d.offerings} test(s): ${d.matched} matched, ${d.ambiguous} need review, ${d.unmatched} not found — ${d.published} price(s) published.`);
      loadCatalog(); // refresh to show newly-published prices
    } else {
      setMsg(`Queued ${j.data?.enqueued ?? 0} scrape job(s). Watch the Change Queue for results.`);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this vendor?')) return;
    await fetch(`/api/v1/admin/vendors/${id}`, { method: 'DELETE' });
    router.push('/admin/vendors');
  };

  if (!vendor) return <div className="p-6 text-brand-400">Loading...</div>;
  const t = vendor.trust;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="admin-h1">Edit Vendor</h1>
        {msg && <span className="text-sm text-success-700">{msg}</span>}
      </div>

      {/* Vendor details */}
      <div className="admin-card max-w-2xl space-y-4 p-6">
        <h2 className="admin-h2">Details</h2>
        {([['name', 'Name'], ['slug', 'Slug'], ['websiteUrl', 'Website URL'], ['affiliateUrlTemplate', 'Affiliate URL Template'], ['logoUrl', 'Logo URL']] as const).map(([f, label]) => (
          <div key={f}>
            <label className={labelCls}>{label}</label>
            <input className="admin-input" value={(vendor[f] as string | null) ?? ''} onChange={(e) => setV(f, e.target.value)} />
          </div>
        ))}
        <div>
          <label className={labelCls}>Trust Override</label>
          <div className="flex items-center gap-3">
            <select className="admin-input admin-input-inline" value={vendor.trustOverride ?? ''} onChange={(e) => setV('trustOverride', e.target.value || null)}>
              <option value="">Auto (from scraper health)</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
            <span className="text-xs text-brand-400">Effective:</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TRUST_BADGE[vendor.effectiveTrust]}`}>{vendor.effectiveTrust}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="isActive" className="h-4 w-4 rounded" checked={vendor.isActive} onChange={(e) => setV('isActive', e.target.checked)} />
          <label htmlFor="isActive" className="text-sm font-medium text-brand-700">Active</label>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={saveVendor} disabled={savingVendor} className="admin-btn">{savingVendor ? 'Saving...' : 'Save'}</button>
          <button onClick={handleDelete} className="admin-btn admin-btn-danger">Delete</button>
        </div>
      </div>

      {/* Catalog: which tests this vendor offers */}
      <div className="admin-card space-y-4 p-6">
        <div>
          <h2 className="admin-h2">Catalog</h2>
          <p className="mt-1 text-sm text-brand-400">The tests this vendor offers. Each links to the product URL its scraper reads for the price.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-left text-brand-600">
                <th className="py-2 pr-3">Test</th>
                <th className="py-2 pr-3">Product URL</th>
                <th className="py-2 pr-3 w-28">Price</th>
                <th className="py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {catalog.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-center text-brand-400">No tests linked yet.</td></tr>
              ) : (
                catalog.map((o) => (
                  <tr key={o.id} className="border-b border-brand-100">
                    <td className="py-2 pr-3 font-medium text-brand-900">{o.testName}</td>
                    <td className="py-2 pr-3">
                      <input
                        className="admin-input"
                        defaultValue={o.externalUrl ?? ''}
                        placeholder="https://…"
                        onBlur={(e) => saveLink(o.id, { externalUrl: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1">
                        <span className="text-brand-400">$</span>
                        <input
                          type="number"
                          step="0.01"
                          className="admin-input"
                          defaultValue={o.currentPrice != null ? Number(o.currentPrice).toFixed(2) : ''}
                          onBlur={(e) => saveLink(o.id, { currentPrice: e.target.value })}
                        />
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => unlink(o.id)} className="admin-btn admin-btn-sm admin-btn-danger" title="Unlink">✕</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Add a link */}
        <div className="flex flex-wrap items-end gap-2 border-t border-brand-100 pt-4">
          <div className="min-w-48 flex-1">
            <label className={labelCls}>Add test</label>
            <select className="admin-input" value={newTestId} onChange={(e) => setNewTestId(e.target.value)}>
              <option value="">— Select a test —</option>
              {availableTests.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="min-w-48 flex-1">
            <label className={labelCls}>Product URL (optional)</label>
            <input className="admin-input" placeholder="https://…" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
          </div>
          <div className="w-28">
            <label className={labelCls}>Price</label>
            <input type="number" className="admin-input" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          </div>
          <button onClick={addLink} disabled={!newTestId} className="admin-btn">Add</button>
        </div>
      </div>

      {/* Scraper health */}
      <div className="admin-card max-w-2xl space-y-3 p-6">
        <h2 className="admin-h2">Scraper Health</h2>
        {!t.hasData ? (
          <p className="text-sm text-brand-400">No scrape runs yet — trust defaults to a neutral MEDIUM until the scraper has run.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['Computed', t.computed],
              ['Score', `${t.score}/100`],
              ['Success rate', `${Math.round(t.successRate * 100)}%`],
              ['Reject rate', `${Math.round(t.rejectRate * 100)}%`],
              ['Runs analyzed', String(t.totalRuns)],
              ['Last success', t.lastSuccessAt ? new Date(t.lastSuccessAt).toLocaleDateString() : '—'],
              ['Days since', t.daysSinceSuccess === null ? '—' : String(Math.round(t.daysSinceSuccess))],
            ].map(([label, val]) => (
              <div key={label}>
                <div className="text-xs font-medium text-brand-400">{label}</div>
                <div className="mt-0.5 text-sm font-semibold text-brand-900">{val}</div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-brand-400">Trust is computed from recent run success rate, how recently a run succeeded, and how often staged changes get rejected. LOW trust sends every price change to the Change Queue; HIGH trust auto-approves a wider range.</p>
      </div>

      {/* Scraper config */}
      <div className="admin-card max-w-2xl space-y-4 p-6">
        <h2 className="admin-h2">Scraper Configuration</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Engine</label>
            <select className="admin-input" value={config.engine} onChange={(e) => setC('engine', e.target.value as ConfigForm['engine'])}>
              <option value="HTTP">HTTP (fast, static pages)</option>
              <option value="PLAYWRIGHT">Playwright (JS-rendered)</option>
              <option value="SELENIUM">Selenium</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Base URL</label>
            <input className="admin-input" placeholder="https://vendor.com" value={config.baseUrl} onChange={(e) => setC('baseUrl', e.target.value)} />
          </div>
        </div>
        {/* Catalog mode: crawl the vendor's catalog and match our tests by code/name (GoodLabs).
            When on, the CSS selectors below are ignored — matching uses Quest/LabCorp codes + name. */}
        <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-3">
          <div className="flex items-center gap-3">
            <input type="checkbox" id="catalogMode" className="h-4 w-4 rounded" checked={config.catalogMode} onChange={(e) => setC('catalogMode', e.target.checked)} />
            <label htmlFor="catalogMode" className="text-sm font-medium text-brand-700">Catalog mode (crawl catalog &amp; match by Quest/LabCorp code or name)</label>
          </div>
          {config.catalogMode && (
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Catalog source (adapter)</label>
                <select className="admin-input" value={config.catalogAdapter} onChange={(e) => setC('catalogAdapter', e.target.value)}>
                  <option value="goodlabs">GoodLabs (goodlabs.com)</option>
                  <option value="ownyourlabs">Own Your Labs (ownyourlabs.com)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Catalog path</label>
                <input className="admin-input" placeholder="/shop" value={config.catalogPath} onChange={(e) => setC('catalogPath', e.target.value)} />
              </div>
              <p className="col-span-2 mt-1 text-xs text-brand-400">The scraper fetches Base URL + catalog path to list all tests, then matches each linked test by Quest/LabCorp code or name and stages prices. CSS selectors below are ignored. “Scrape now” runs it inline (no worker needed).</p>
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>Price selector (CSS){config.catalogMode && <span className="ml-2 text-xs font-normal text-brand-400">(ignored in catalog mode)</span>}</label>
          <input className="admin-input" placeholder=".price, .test-price" value={config.priceSelector} onChange={(e) => setC('priceSelector', e.target.value)} disabled={config.catalogMode} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Name selector (optional)</label>
            <input className="admin-input" value={config.nameSelector} onChange={(e) => setC('nameSelector', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Container selector (optional)</label>
            <input className="admin-input" value={config.containerSelector} onChange={(e) => setC('containerSelector', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Schedule (cron)</label>
            <input className="admin-input" placeholder="0 6 * * *" value={config.scheduleCron} onChange={(e) => setC('scheduleCron', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Timeout (ms)</label>
            <input type="number" className="admin-input" value={config.timeoutMs} onChange={(e) => setC('timeoutMs', Number(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>Max retries</label>
            <input type="number" className="admin-input" value={config.maxRetries} onChange={(e) => setC('maxRetries', Number(e.target.value))} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="cfgEnabled" className="h-4 w-4 rounded" checked={config.isEnabled} onChange={(e) => setC('isEnabled', e.target.checked)} />
          <label htmlFor="cfgEnabled" className="text-sm font-medium text-brand-700">Scraping enabled for this vendor</label>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button onClick={saveConfig} disabled={savingConfig} className="admin-btn">{savingConfig ? 'Saving...' : 'Save Scraper Config'}</button>
          <button onClick={runScrape} disabled={scraping} className="admin-btn admin-btn-ghost">{scraping ? 'Scraping…' : 'Scrape now'}</button>
          <span className="text-xs text-brand-400">Prices every linked test now. Catalog vendors run inline; clean matches publish immediately, ambiguous ones go to the Change Queue.</span>
        </div>
      </div>
    </div>
  );
}
