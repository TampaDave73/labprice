import 'dotenv/config';
import { connection } from './redis';
import { createScheduleWorker } from './workers/scrape-schedule';
import { createExecuteWorker } from './workers/scrape-execute';
import { createPublishWorker } from './workers/scrape-publish';
import { createPartitionWorker } from './workers/partition-maintenance';
import { startHealthServer } from './health';

async function main() {
  console.log('[worker] Starting LabPrice worker…');

  const workers = [
    createScheduleWorker(),
    createExecuteWorker(),
    createPublishWorker(),
    createPartitionWorker(),
  ];

  console.log(`[worker] Registered ${workers.length} workers`);
  console.log('[worker] Queues: scrape:schedule, scrape:execute, scrape:publish, partition:maintain');

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
