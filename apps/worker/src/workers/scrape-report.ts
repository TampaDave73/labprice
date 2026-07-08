// `scrape-report` worker: builds the weekly scraper-health digest and emails it to all admins
// (job scheduler registered in index.ts — Mondays; also enqueueable by hand for an on-demand
// report). One line per enabled vendor: when it last ran, what it found, which linked tests
// could NOT be priced (UNMATCHED ScrapeResults), plus errors and overdue flags — so the inbox
// line alone says whether scraping is healthy.
import { Worker, type Job } from 'bullmq';
import { prisma } from '@labprice/database';
import { redisConnection } from '../redis';
import { sendAdminEmail } from '../report';

const DAY_MS = 24 * 60 * 60 * 1000;

type VendorLine = { emoji: string; text: string; state: 'ok' | 'failing' | 'overdue' | 'manual' | 'never' };

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

      const lines: VendorLine[] = [];
      for (const config of configs) {
        const name = config.vendor.name;

        if (!config.isEnabled || config.frequencyDays === 0) {
          lines.push({ emoji: '⏸', text: `${name} — scraping ${!config.isEnabled ? 'disabled' : 'set to manual only'}`, state: 'manual' });
          continue;
        }

        const lastJob = await prisma.scrapeJob.findFirst({
          where: { vendorId: config.vendorId },
          orderBy: { createdAt: 'desc' },
          include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });

        if (!lastJob) {
          lines.push({ emoji: '❓', text: `${name} — has NEVER run (due on the next daily tick)`, state: 'never' });
          continue;
        }

        const run = lastJob.runs[0];
        const ranAt = (lastJob.startedAt ?? lastJob.createdAt).toISOString().slice(0, 10);
        const ageDays = Math.floor((now - lastJob.createdAt.getTime()) / DAY_MS);
        // Overdue = the scheduler should have re-run it by now but hasn't (worker down, Redis down,
        // or enqueue failing) — the exact condition this report exists to catch.
        const overdue = ageDays > config.frequencyDays + 1;

        if (lastJob.status === 'FAILED' || run?.status === 'FAILED') {
          lines.push({
            emoji: '❌',
            text: `${name} — FAILED on ${ranAt}: ${lastJob.errorMessage ?? 'see scrape errors'}`,
            state: 'failing',
          });
          continue;
        }

        // Per-test failures: linked tests the last run could not price (not found in the catalog /
        // page). These need manual attention — a wrong code, renamed product, or delisted test.
        const unmatched = await prisma.scrapeResult.findMany({
          where: { runId: run?.id ?? '', status: { in: ['UNMATCHED', 'ERROR'] } },
          include: { test: { select: { name: true } } },
        });

        const stats = run
          ? `${run.testsFound ?? 0} tests, ${run.pricesUpdated ?? 0} price change(s)`
          : 'no run stats';
        const parts = [`${name} — ok on ${ranAt} (${stats})`];
        if (unmatched.length > 0) {
          parts.push(`⚠ ${unmatched.length} test(s) not priced: ${unmatched.map((u) => u.test.name).join(', ')}`);
        }
        if (overdue) parts.push(`⚠ OVERDUE — last run ${ageDays}d ago but frequency is every ${config.frequencyDays}d (is the worker running?)`);

        lines.push({
          emoji: overdue ? '⚠' : unmatched.length > 0 ? '🟡' : '✅',
          text: parts.join('\n     '),
          state: overdue ? 'overdue' : 'ok',
        });
      }

      // Cross-vendor context the admin acts on.
      const [pendingChanges, windowErrors] = await Promise.all([
        prisma.stagedPriceChange.count({ where: { status: 'PENDING' } }),
        prisma.scrapeError.count({ where: { createdAt: { gte: windowStart } } }),
      ]);

      const ok = lines.filter((l) => l.state === 'ok').length;
      const failing = lines.filter((l) => l.state === 'failing').length;
      const overdueCount = lines.filter((l) => l.state === 'overdue').length;
      const never = lines.filter((l) => l.state === 'never').length;

      const subjectBits = [`${ok} ok`];
      if (failing) subjectBits.push(`${failing} failing`);
      if (overdueCount) subjectBits.push(`${overdueCount} overdue`);
      if (never) subjectBits.push(`${never} never ran`);
      const subject = `LabTestCompare scrape report: ${subjectBits.join(', ')}`;

      const body = [
        `Scraper status as of ${new Date().toISOString().slice(0, 10)} (last 7 days):`,
        '',
        ...lines.map((l) => `${l.emoji} ${l.text}`),
        '',
        `Pending price changes awaiting review: ${pendingChanges} (/admin/changes)`,
        `Scrape errors logged this week: ${windowErrors}`,
        '',
        'Frequencies are set per vendor at /admin/vendors; the master switch is on /admin/settings.',
      ].join('\n');

      await sendAdminEmail(subject, body);
      return { vendors: lines.length, ok, failing, overdue: overdueCount };
    },
    { connection: redisConnection },
  );
}
