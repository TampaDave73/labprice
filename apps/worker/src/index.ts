import './env'; // FIRST import on purpose — loads .env (incl. monorepo root) before anything reads process.env
import { connection } from './redis';
import { scrapeScheduleQueue, scrapeReportQueue } from './queues';
import { createScheduleWorker } from './workers/scrape-schedule';
import { createExecuteWorker } from './workers/scrape-execute';
import { createDiscoverWorker } from './workers/scrape-discover';
import { createPublishWorker } from './workers/scrape-publish';
import { createPartitionWorker } from './workers/partition-maintenance';
import { createReportWorker } from './workers/scrape-report';
import { startHealthServer } from './health';

async function main() {
  console.log('[worker] Starting LabTestCompare worker…');

  const workers = [
    createScheduleWorker(),
    createExecuteWorker(),
    createDiscoverWorker(),
    createPublishWorker(),
    createPartitionWorker(),
    createReportWorker(),
  ];

  console.log(`[worker] Registered ${workers.length} workers`);
  console.log('[worker] Queues: scrape-schedule, scrape-execute, scrape-discover, scrape-publish, partition-maintain, scrape-report');

  // Recurring jobs (idempotent upserts — safe on every startup). The daily tick decides per vendor
  // whether it's actually due (frequencyDays), so firing daily does NOT mean scraping daily.
  await scrapeScheduleQueue.upsertJobScheduler('daily-tick', { pattern: '0 6 * * *' }, { name: 'tick' });
  await scrapeReportQueue.upsertJobScheduler('weekly-digest', { pattern: '0 12 * * 1' }, { name: 'digest' });
  console.log('[worker] Schedulers: daily scrape tick @ 06:00 UTC, weekly digest Mondays @ 12:00 UTC');

  startHealthServer();

  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal}, shutting down…`);
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    console.log('[worker] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
