import { Worker, type Job } from 'bullmq';
import { prisma } from '@labprice/database';
import { redisConnection } from '../redis';

const PARTITIONED_TABLES = ['price_history', 'affiliate_clicks', 'search_logs', 'page_views'];

// Retention: analytics tables grow unbounded (a row per keystroke/pageview/click), so drop their
// partitions older than this window. `price_history` is deliberately excluded — it's the long-term
// trend data the product is built on and must be kept.
const RETENTION_MONTHS = 6;
const RETENTION_TABLES = ['affiliate_clicks', 'search_logs', 'page_views'];

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

      // Drop analytics partitions older than the retention window. Dropping whole partitions is far
      // cheaper than DELETE (no row-by-row work, reclaims space immediately) and can't touch newer
      // data. We enumerate actual child partitions via pg_inherits rather than guessing names.
      const cutoff = new Date(now.getFullYear(), now.getMonth() - RETENTION_MONTHS, 1);
      let dropped = 0;
      for (const table of RETENTION_TABLES) {
        try {
          const partitions = await prisma.$queryRawUnsafe<{ name: string }[]>(
            `SELECT inhrelid::regclass::text AS name FROM pg_inherits WHERE inhparent = '${table}'::regclass`,
          );
          for (const { name } of partitions) {
            const m = name.match(/_y(\d{4})m(\d{2})$/);
            if (!m) continue;
            const partStart = new Date(Number(m[1]), Number(m[2]) - 1, 1);
            if (partStart < cutoff) {
              await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${name}`);
              dropped++;
              console.log(`[partition] Dropped expired partition ${name}`);
            }
          }
        } catch (err) {
          console.warn(`[partition] Retention sweep failed for ${table}:`, err);
        }
      }

      console.log(`[partition] Retention: dropped ${dropped} partitions older than ${RETENTION_MONTHS} months`);
      return { created, dropped };
    },
    { connection: redisConnection },
  );
}
