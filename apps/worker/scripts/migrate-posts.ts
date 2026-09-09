// Creates the `posts` table on a database that predates the blog.
//
//   pnpm --filter @labprice/worker exec tsx scripts/migrate-posts.ts
//   railway ssh --service scrape-worker "pnpm --filter @labprice/worker exec tsx scripts/migrate-posts.ts"
//
// Written as an explicit, additive script rather than `prisma db push` because production carries
// schema drift Prisma doesn't know about — the `search_vector` generated column and its indexes,
// and `users.email` — and `db push --accept-data-loss` would drop them (CLAUDE.md gotcha 15). The
// DDL below is exactly what `prisma migrate diff` emits for the Post model, with IF NOT EXISTS added
// so a re-run is a no-op.
import 'dotenv/config';
import { prisma } from '@labprice/database';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "posts" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT 'Dave S.',
    "hero_url" TEXT,
    "hero_alt" TEXT,
    "hero_credit" TEXT,
    "faq" TEXT,
    "related_tests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "posts_slug_key" ON "posts"("slug")`,
  `CREATE INDEX IF NOT EXISTS "posts_is_published_published_at_idx" ON "posts"("is_published", "published_at")`,
];

async function main() {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`ok  ${sql.split('\n')[0]!.trim().slice(0, 70)}…`);
  }

  // Prove the table is actually usable through the Prisma client, not just present in the catalog —
  // a column-name mismatch between the DDL and the model would otherwise only surface at runtime.
  const count = await prisma.post.count();
  console.log(`\nposts table ready — ${count} row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
