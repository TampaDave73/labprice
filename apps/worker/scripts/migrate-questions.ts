// Creates the `question_candidates` table and its two enums on a database that predates the
// question-research queue.
//
//   pnpm --filter @labprice/worker exec tsx scripts/migrate-questions.ts
//   railway ssh --service scrape-worker "pnpm --filter @labprice/worker exec tsx scripts/migrate-questions.ts"
//
// Additive and re-runnable, like migrate-posts.ts, and for the same reason: production carries schema
// drift Prisma doesn't know about (the `search_vector` generated column and its indexes, `users.email`)
// that `db push --accept-data-loss` would drop — CLAUDE.md gotcha 15. The DDL is exactly what
// `prisma migrate diff` emits, with existence guards added.
import 'dotenv/config';
import { prisma } from '@labprice/database';

// Postgres has no CREATE TYPE IF NOT EXISTS, so the enums are guarded by a DO block.
const STATEMENTS = [
  `DO $$ BEGIN
     CREATE TYPE "QuestionSource" AS ENUM ('REDDIT', 'SEARCH_LOG', 'MANUAL');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "QuestionStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED', 'DRAFTED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "question_candidates" (
    "id" TEXT NOT NULL,
    "source" "QuestionSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "source_url" TEXT,
    "origin" TEXT,
    "title" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "matched_tests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "QuestionStatus" NOT NULL DEFAULT 'NEW',
    "post_id" TEXT,
    "notes" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_candidates_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "question_candidates_source_sourceId_key" ON "question_candidates"("source", "sourceId")`,
  `CREATE INDEX IF NOT EXISTS "question_candidates_status_score_idx" ON "question_candidates"("status", "score")`,
];

async function main() {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`ok  ${sql.trim().split('\n')[0]!.trim().slice(0, 68)}…`);
  }

  // Prove it round-trips through the Prisma client, not just the catalog — a column-name mismatch
  // between this DDL and the model would otherwise only surface at runtime.
  const count = await prisma.questionCandidate.count();
  console.log(`\nquestion_candidates ready — ${count} row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
