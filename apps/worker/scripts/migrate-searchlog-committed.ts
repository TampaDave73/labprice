// Adds `search_logs.committed`, which separates a search someone actually submitted from the
// per-keystroke autocomplete lookups the SearchBar fires.
//
//   pnpm --filter @labprice/worker exec tsx scripts/migrate-searchlog-committed.ts
//   railway ssh --service scrape-worker "pnpm --filter @labprice/worker exec tsx scripts/migrate-searchlog-committed.ts"
//
// Additive and re-runnable. Rows that already exist keep the default `true` — they were written
// before the distinction existed and cannot be attributed after the fact. That is deliberate: the
// alternative is guessing, and destroying the genuinely committed history along with the noise. The
// research harvester compensates with text heuristics for the legacy window.
//
// `search_logs` is large and partitioned in production, so this uses ADD COLUMN with a constant
// DEFAULT — a metadata-only change in Postgres 11+, no table rewrite, no long lock.
import 'dotenv/config';
import { prisma } from '@labprice/database';

const STATEMENTS = [
  `ALTER TABLE "search_logs" ADD COLUMN IF NOT EXISTS "committed" BOOLEAN NOT NULL DEFAULT true`,
];

async function main() {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`ok  ${sql.slice(0, 76)}…`);
  }

  // Round-trip through the client, so a name mismatch between this DDL and the model surfaces here
  // rather than at runtime.
  const [total, committed] = await Promise.all([
    prisma.searchLog.count(),
    prisma.searchLog.count({ where: { committed: true } }),
  ]);
  console.log(`\nsearch_logs ready — ${total} row(s), ${committed} marked committed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
