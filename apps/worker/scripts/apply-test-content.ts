// Writes the reviewed copy in content/test-content.json onto the matching tests.
//
//   DOTENV_CONFIG_PATH=<repo>/.env pnpm --filter @labprice/worker exec tsx scripts/apply-test-content.ts
//   railway ssh --service scrape-worker "pnpm --filter @labprice/worker exec tsx scripts/apply-test-content.ts"
//
// Add --force to overwrite fields that already have copy. Without it, an existing value is left
// alone: this script is the bulk-fill path, and the admin editor is the authority on anything a
// human has already touched.
//
// Deliberately narrow — it writes only the five prose fields. Order codes, short names, categories
// and `confidence` on these tests are already set and verified; the generator returns null for codes
// and this script has no code path that could write one.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@labprice/database';

interface Entry {
  slug: string;
  name: string;
  description: string;
  purpose: string;
  procedure: string;
  preparation: string;
  normalRange: string;
  generatedAt: string;
}

const FIELDS = ['description', 'purpose', 'procedure', 'preparation', 'normalRange'] as const;

async function main() {
  const force = process.argv.includes('--force');
  const file = resolve(__dirname, '../content/test-content.json');
  const entries = JSON.parse(readFileSync(file, 'utf8')) as Entry[];

  let written = 0;
  let skipped = 0;
  const missing: string[] = [];

  for (const e of entries) {
    const test = await prisma.test.findUnique({
      where: { slug: e.slug },
      select: { id: true, name: true, description: true, purpose: true, procedure: true, preparation: true, normalRange: true, deletedAt: true },
    });
    if (!test || test.deletedAt) {
      missing.push(e.slug);
      continue;
    }

    const data: Record<string, string> = {};
    for (const f of FIELDS) {
      const current = test[f];
      if (force || current == null || current.trim() === '') data[f] = e[f];
    }

    if (Object.keys(data).length === 0) {
      skipped += 1;
      console.log(`skip     ${e.slug} (already populated)`);
      continue;
    }

    await prisma.test.update({ where: { id: test.id }, data });
    written += 1;
    console.log(`written  ${e.slug} (${Object.keys(data).join(', ')})`);
  }

  console.log(`\n${written} updated, ${skipped} left alone${missing.length ? `, ${missing.length} not found: ${missing.join(', ')}` : ''}`);

  const remaining = await prisma.test.count({ where: { deletedAt: null, OR: [{ description: null }, { description: '' }] } });
  console.log(`${remaining} live test(s) still have no description.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
