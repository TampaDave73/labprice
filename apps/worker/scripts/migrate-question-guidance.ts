// Adds `question_candidates.guidance` — free-text direction for the article generator.
//
//   pnpm --filter @labprice/worker exec tsx scripts/migrate-question-guidance.ts
//   railway ssh --service scrape-worker "pnpm --filter @labprice/worker exec tsx scripts/migrate-question-guidance.ts"
//
// Additive and re-runnable, for the reason in CLAUDE.md gotcha 15: production carries schema drift
// Prisma doesn't know about, so `db push` is off the table.
import 'dotenv/config';
import { prisma } from '@labprice/database';

const STATEMENTS = [`ALTER TABLE "question_candidates" ADD COLUMN IF NOT EXISTS "guidance" TEXT`];

async function main() {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`ok  ${sql.slice(0, 76)}…`);
  }

  // Round-trip through the client so a name mismatch surfaces here, not at runtime.
  const withGuidance = await prisma.questionCandidate.count({ where: { guidance: { not: null } } });
  const total = await prisma.questionCandidate.count();
  console.log(`\nquestion_candidates ready — ${total} row(s), ${withGuidance} with direction set.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
