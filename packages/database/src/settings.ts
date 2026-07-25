// Scrape-related system settings. Reads the `system_settings` rows (edited on the admin Settings
// page) into a typed object with defaults. The worker uses this for the auto-approval thresholds
// and schedule; keys are the canonical ones in KEY_TO_FIELD.
import { prisma } from './client';

export interface ScrapeSettings {
  scrapeEnabled: boolean;
  scrapeIntervalHours: number;
  scrapeDefaultTimeoutMs: number;
  autoApproveDecreasePercent: number;
  autoApproveIncreasePercent: number;
}

/** Canonical scrape-related system-setting keys (used by admin UI and worker). */
export const SCRAPE_SETTING_DEFAULTS: ScrapeSettings = {
  scrapeEnabled: true,
  scrapeIntervalHours: 24,
  scrapeDefaultTimeoutMs: 30000,
  autoApproveDecreasePercent: 20,
  autoApproveIncreasePercent: 5,
};

const KEY_TO_FIELD: Record<string, keyof ScrapeSettings> = {
  scrape_enabled: 'scrapeEnabled',
  scrape_interval_hours: 'scrapeIntervalHours',
  scrape_default_timeout_ms: 'scrapeDefaultTimeoutMs',
  auto_approve_decrease_percent: 'autoApproveDecreasePercent',
  auto_approve_increase_percent: 'autoApproveIncreasePercent',
};

export async function getScrapeSettings(): Promise<ScrapeSettings> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: Object.keys(KEY_TO_FIELD) } } });
  const out: ScrapeSettings = { ...SCRAPE_SETTING_DEFAULTS };
  for (const row of rows) {
    const field = KEY_TO_FIELD[row.key];
    if (!field) continue;
    const v = row.value;
    if (field === 'scrapeEnabled') out.scrapeEnabled = v === true || v === 'true';
    else if (typeof v === 'number') out[field] = v;
    else {
      // `||` would silently discard a legitimate 0 (e.g. "never auto-approve" thresholds) — only
      // fall back to the default when the stored value doesn't parse to a real number at all.
      const n = Number(v);
      out[field] = Number.isFinite(n) ? n : SCRAPE_SETTING_DEFAULTS[field];
    }
  }
  return out;
}
