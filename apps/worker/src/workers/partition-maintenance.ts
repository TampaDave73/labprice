import { Worker, type Job } from 'bullmq';
import { prisma } from '@labprice/database';
import { redisConnection } from '../redis';

const PARTITIONED_TABLES = ['price_history', 'affiliate_clicks', 'search_logs', 'page_views'];

function getPartitionName(table: string, year: number, month: number): string {
  return `${table}_y${year}m${String(month).padStart(2, '0')}`;
}

function getPartitionBounds(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const toMonth = month === 12 ? 1 : month + 1;
  const toYear = month === 12 ? year + 1 : year;
  const to = `${toYear}-${String(toMonth).padStart(2, '0')}-01`;
  return { from, to };
}

export function createPartitionWorker() {
  return new Worker(
    'partition-maintain',
    async (job: Job) => {
      console.log('[partition] Running monthly partition maintenance');

      const now = new Date();
      const months: { year: number; month: number }[] = [];

      // Create partitions for current month + 2 months ahead
      for (let offset = 0; offset <= 2; offset++) {
        const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
      }

      let created = 0;
      for (const table of PARTITIONED_TABLES) {
        for (const { year, month } of months) {
          const name = getPartitionName(table, year, month);
          const { from, to } = getPartitionBounds(year, month);

          try {
            await prisma.$executeRawUnsafe(
              `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF ${table} FOR VALUES FROM ('${from}') TO ('${to}')`,
            );
            created++;
          } catch (err) {
            // Partition may already exist — that's fine
            console.warn(`[partition] Could not create ${name}:`, err);
          }
        }
      }

      console.log(`[partition] Ensured ${created} partitions across ${PARTITIONED_TABLES.length} tables`);
      return { created };
    },
    { connection: redisConnection },
  );
}
