// One-time (idempotent) taxonomy expansion: upserts the 21-category list (10 original + 11 new from
// the 2026-07-27 master biomarker research pass) and stamps isPrimary on every row, including any
// pre-existing category not in this file (left untouched otherwise). Safe to re-run.
// Run (from apps/worker): DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/seed-category-taxonomy.ts
import 'dotenv/config'; // must precede the @labprice/database import — PrismaClient reads DATABASE_URL at construction
import { prisma } from '@labprice/database';
import categories from '../../../packages/database/data/2026-07-27-master-tests/categories.json';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function main() {
  const existing = await prisma.category.findMany({ select: { name: true, displayOrder: true } });
  let nextOrder = Math.max(0, ...existing.map((c) => c.displayOrder)) + 1;

  for (const cat of categories as { name: string; isPrimary: boolean }[]) {
    const already = existing.find((e) => e.name === cat.name);
    await prisma.category.upsert({
      where: { name: cat.name },
      update: { isPrimary: cat.isPrimary },
      create: {
        name: cat.name,
        slug: slugify(cat.name),
        displayOrder: already ? already.displayOrder : nextOrder++,
        isPrimary: cat.isPrimary,
      },
    });
    console.log(`${already ? 'updated' : 'created'}: ${cat.name} (isPrimary=${cat.isPrimary})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
