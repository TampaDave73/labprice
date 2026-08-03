// `scrape-report` worker: builds the weekly scraper-health digest and emails it to all admins
// (job scheduler registered in index.ts — Mondays; also enqueueable on demand via
// scripts/trigger-digest.js). Sent as an HTML email — summary chips, one status table row per
// vendor, and a compact "tests we couldn't price" section — with a short plain-text fallback.
// The inbox subject alone says whether scraping is healthy.
import { Worker, type Job } from 'bullmq';
import { prisma } from '@labprice/database';
import { redisConnection } from '../redis';
import { sendAdminEmail } from '../report';

const DAY_MS = 24 * 60 * 60 * 1000;

// Ranked worst-first so the table surfaces problems at the top.
type State = 'failed' | 'overdue' | 'gaps' | 'ok' | 'never' | 'manual';
const STATE_ORDER: State[] = ['failed', 'overdue', 'gaps', 'ok', 'never', 'manual'];

interface VendorRow {
  name: string;
  state: State;
  statusLabel: string;
  lastRun: string; // YYYY-MM-DD or '—'
  priced: string; // "33 of 35" or '—'
  changes: string; // price changes in the last run
  unmatchedNames: string[]; // tests the last run could not price
  detail?: string; // failure message / overdue explainer
}

const STATE_STYLE: Record<State, { dot: string; label: string }> = {
  failed: { dot: '#dc2626', label: 'Failed' },
  overdue: { dot: '#d97706', label: 'Overdue' },
  gaps: { dot: '#ca8a04', label: 'OK — gaps' },
  ok: { dot: '#16a34a', label: 'OK' },
  never: { dot: '#6b7280', label: 'Never ran' },
  manual: { dot: '#9ca3af', label: 'Manual only' },
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Email clients need inline styles; keep the markup boring and table-based.
// Exported for preview/testing (scripts can render sample data without a Worker).
export function renderHtml(rows: VendorRow[], meta: { date: string; pendingChanges: number; windowErrors: number; counts: Record<State, number> }): string {
  const chip = (n: number, label: string, color: string) =>
    n > 0
      ? `<span style="display:inline-block;margin:0 8px 8px 0;padding:4px 12px;border-radius:14px;background:${color}18;color:${color};font-weight:600;font-size:13px;">${n} ${label}</span>`
      : '';

  const tr = (r: VendorRow) => {
    const s = STATE_STYLE[r.state];
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#111827;white-space:nowrap;">${esc(r.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${s.dot};margin-right:6px;"></span>${esc(r.statusLabel)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;white-space:nowrap;">${esc(r.lastRun)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:center;">${esc(r.priced)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:center;">${esc(r.changes)}</td>
    </tr>`;
  };

  // "Couldn't price" details: only vendors with gaps, list capped so one bad vendor can't flood
  // the email — the full picture lives on the admin vendor page.
  const CAP = 8;
  const gapRows = rows.filter((r) => r.unmatchedNames.length > 0);
  const gapsHtml = gapRows.length
    ? `<h3 style="margin:28px 0 6px;font-size:15px;color:#111827;">Tests we couldn't price (need attention)</h3>
       <p style="margin:0 0 12px;font-size:12px;color:#6b7280;">Usually a wrong Quest/LabCorp code, a renamed product, or the vendor no longer sells it. Fix from each vendor's admin page.</p>
       ${gapRows
         .map((r) => {
           const shown = r.unmatchedNames.slice(0, CAP).map(esc).join(' &middot; ');
           const more = r.unmatchedNames.length > CAP ? ` <span style="color:#6b7280;">…and ${r.unmatchedNames.length - CAP} more</span>` : '';
           return `<p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#374151;"><strong style="color:#111827;">${esc(r.name)}</strong> <span style="color:#b45309;font-weight:600;">(${r.unmatchedNames.length})</span><br>${shown}${more}</p>`;
         })
         .join('')}`
    : '';

  const failures = rows.filter((r) => r.state === 'failed' && r.detail);
  const failuresHtml = failures.length
    ? `<h3 style="margin:28px 0 6px;font-size:15px;color:#b91c1c;">Failures</h3>
       ${failures.map((r) => `<p style="margin:0 0 8px;font-size:13px;color:#374151;"><strong>${esc(r.name)}</strong>: ${esc(r.detail!)}</p>`).join('')}`
    : '';

  const overdueNote = meta.counts.overdue > 0
    ? `<p style="margin:16px 0 0;padding:10px 14px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;font-size:13px;color:#92400e;">
        ⏰ <strong>${meta.counts.overdue} scraper(s) are overdue</strong> — they haven't run within their scheduled window. If this persists past the next daily run (6:00 UTC), check that the worker service is up on Railway.
      </p>`
    : '';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:24px;">
      <h2 style="margin:0 0 2px;font-size:18px;color:#111827;">Scraper status report</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">${meta.date} &middot; covers the last 7 days</p>
      <div>
        ${chip(meta.counts.ok, 'healthy', '#16a34a')}
        ${chip(meta.counts.gaps, 'with gaps', '#ca8a04')}
        ${chip(meta.counts.failed, 'failed', '#dc2626')}
        ${chip(meta.counts.overdue, 'overdue', '#d97706')}
        ${chip(meta.counts.never, 'never ran', '#6b7280')}
        ${chip(meta.counts.manual, 'manual only', '#9ca3af')}
      </div>
      ${overdueNote}
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:16px;border-collapse:collapse;font-size:13px;">
        <tr>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb;">Vendor</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb;">Status</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb;">Last run</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb;">Priced</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb;">Changes</th>
        </tr>
        ${rows.map(tr).join('')}
      </table>
      ${failuresHtml}
      ${gapsHtml}
      <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.7;">
        Pending price changes to review: <strong>${meta.pendingChanges}</strong> (admin &rarr; Change Queue) &middot; Scrape errors this week: <strong>${meta.windowErrors}</strong><br>
        Scrape frequency is set per vendor (admin &rarr; Vendors); the master switch is on admin &rarr; Settings.
      </p>
    </div>
  </div>
</body></html>`;
}

// Short plain-text fallback (also what local no-API-key runs print to the console).
function renderText(rows: VendorRow[], meta: { date: string; pendingChanges: number; windowErrors: number }): string {
  return [
    `Scraper status ${meta.date} (last 7 days):`,
    '',
    ...rows.map((r) => {
      const bits = [`[${STATE_STYLE[r.state].label}] ${r.name} — last run ${r.lastRun}, priced ${r.priced}, ${r.changes} change(s)`];
      if (r.unmatchedNames.length) bits.push(`  couldn't price ${r.unmatchedNames.length}: ${r.unmatchedNames.slice(0, 5).join(', ')}${r.unmatchedNames.length > 5 ? ', …' : ''}`);
      if (r.detail) bits.push(`  ${r.detail}`);
      return bits.join('\n');
    }),
    '',
    `Pending price changes to review: ${meta.pendingChanges} · Scrape errors this week: ${meta.windowErrors}`,
  ].join('\n');
}

export function createReportWorker() {
  return new Worker(
    'scrape-report',
    async (job: Job) => {
      console.log(`[report] Building scrape digest (job ${job.id})`);
      const now = Date.now();
      const windowStart = new Date(now - 7 * DAY_MS);

      const configs = await prisma.scrapeVendorConfig.findMany({
        where: { vendor: { deletedAt: null, isActive: true } },
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { vendor: { name: 'asc' } },
      });

      const rows: VendorRow[] = [];
      for (const config of configs) {
        const name = config.vendor.name;

        if (!config.isEnabled || config.frequencyDays === 0) {
          rows.push({ name, state: 'manual', statusLabel: !config.isEnabled ? 'Disabled' : 'Manual only', lastRun: '—', priced: '—', changes: '—', unmatchedNames: [] });
          continue;
        }

        // `partial: false` — a requeue-on-add run prices a single newly-linked test, so reporting the
        // vendor's health from it is meaningless ("priced 0 of 1" for a vendor with 200 offerings).
        const lastJob = await prisma.scrapeJob.findFirst({
          where: { vendorId: config.vendorId, partial: false },
          orderBy: { createdAt: 'desc' },
          include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });

        if (!lastJob) {
          rows.push({ name, state: 'never', statusLabel: 'Never ran', lastRun: '—', priced: '—', changes: '—', unmatchedNames: [], detail: 'Due on the next daily run.' });
          continue;
        }

        const run = lastJob.runs[0];
        const ranAt = (lastJob.startedAt ?? lastJob.createdAt).toISOString().slice(0, 10);
        const ageDays = Math.floor((now - lastJob.createdAt.getTime()) / DAY_MS);
        // Overdue = the scheduler should have re-run it by now but hasn't (worker down, Redis down,
        // or enqueue failing) — the exact condition this report exists to catch.
        const overdue = ageDays > config.frequencyDays + 1;

        if (lastJob.status === 'FAILED' || run?.status === 'FAILED') {
          rows.push({
            name, state: 'failed', statusLabel: 'Failed', lastRun: ranAt, priced: '—', changes: '—', unmatchedNames: [],
            detail: lastJob.errorMessage ?? 'see scrape errors on the vendor page',
          });
          continue;
        }

        // Per-test failures: linked tests the last run could not price (not found in the catalog /
        // page). These need manual attention — a wrong code, renamed product, or delisted test.
        const unmatched = await prisma.scrapeResult.findMany({
          where: { runId: run?.id ?? '', status: { in: ['UNMATCHED', 'ERROR'] } },
          include: { test: { select: { name: true } } },
        });
        const unmatchedNames = unmatched.map((u) => u.test.name);

        // `ScrapeRun.testsFound` is tests ATTEMPTED, not tests priced (persist.ts sets it to
        // `matches.length`), so the priced count is what's left after the ones we couldn't price.
        // Adding the two together double-counted: a run that attempted 1 test and failed to price it
        // reported "1 of 2" — claiming a success that never happened, on a total that never existed.
        const totalLinked = run?.testsFound ?? 0;
        const pricedCount = Math.max(0, totalLinked - unmatchedNames.length);
        const state: State = overdue ? 'overdue' : unmatchedNames.length > 0 ? 'gaps' : 'ok';
        rows.push({
          name,
          state,
          statusLabel: overdue ? `Overdue (${ageDays}d)` : unmatchedNames.length > 0 ? 'OK, with gaps' : 'OK',
          lastRun: ranAt,
          priced: totalLinked > 0 ? `${pricedCount} of ${totalLinked}` : '—',
          changes: String(run?.pricesUpdated ?? 0),
          unmatchedNames,
        });
      }

      rows.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.name.localeCompare(b.name));

      // Cross-vendor context the admin acts on.
      const [pendingChanges, windowErrors] = await Promise.all([
        prisma.stagedPriceChange.count({ where: { status: 'PENDING' } }),
        prisma.scrapeError.count({ where: { createdAt: { gte: windowStart } } }),
      ]);

      const counts = Object.fromEntries(STATE_ORDER.map((s) => [s, rows.filter((r) => r.state === s).length])) as Record<State, number>;
      const healthy = counts.ok + counts.gaps;

      const subjectBits = [`${healthy} ok`];
      if (counts.failed) subjectBits.push(`${counts.failed} failed`);
      if (counts.overdue) subjectBits.push(`${counts.overdue} overdue`);
      if (counts.never) subjectBits.push(`${counts.never} never ran`);
      const subject = `LabTestCompare scrape report: ${subjectBits.join(', ')}`;

      const meta = { date: new Date().toISOString().slice(0, 10), pendingChanges, windowErrors, counts };
      await sendAdminEmail(subject, renderText(rows, meta), renderHtml(rows, meta));
      return { vendors: rows.length, ...counts };
    },
    { connection: redisConnection },
  );
}
