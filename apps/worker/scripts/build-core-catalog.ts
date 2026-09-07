// Generates the 30-row core catalog (2026-09-07 reset) by subsetting the 246-row master biomarker
// list to the slugs in slugs.json. Regenerate rather than hand-editing tests.json, so the codes stay
// traceable to the master list — the spreadsheet that drove this catalog explicitly says its own
// codes came from general web search and should not feed live pricing.
//
// Run (from apps/worker):  npx tsx scripts/build-core-catalog.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '../../../packages/database/data/2026-09-07-core-30');
const MASTER = join(__dirname, '../../../packages/database/data/2026-07-27-master-tests/tests.json');

type Row = Record<string, string>;

const master = JSON.parse(readFileSync(MASTER, 'utf8')) as Row[];
const slugs = JSON.parse(readFileSync(join(DIR, 'slugs.json'), 'utf8')) as string[];

const bySlug = new Map(master.map((r) => [r.slug!, r]));
const missing = slugs.filter((s) => !bySlug.has(s));
if (missing.length > 0) {
  console.error(`ABORT — ${missing.length} slug(s) not in the master list:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

// is_popular is forced on: with a 30-test catalog these ARE the popular set, and the homepage reads
// this flag to decide what to feature.
const rows = slugs.map((s) => ({ ...bySlug.get(s)!, is_popular: 'TRUE' }));

writeFileSync(join(DIR, 'tests.json'), `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Wrote ${rows.length} tests.`);
for (const r of rows) console.log(`  ${r.slug!.padEnd(46)} Q=${r.quest_code || '—'} L=${r.labcorp_code || '—'} ${r.confidence}`);
