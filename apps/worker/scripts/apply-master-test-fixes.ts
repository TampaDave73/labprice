// Applies packages/database/data/2026-07-27-master-tests/fixes.json against whatever `tests` rows
// currently exist, BEFORE the master-list import (import-master-tests.ts) runs. Matching is by exact
// existing_test_name. Every applied field change gets its own AuditLog row (actorId: null = system) —
// "log every applied fix to an audit table" per the migration spec, reusing the existing AuditLog
// model rather than adding a new one.
//
// Dry-run by default; pass --apply to write.
// Run (from apps/worker): DOTENV_CONFIG_PATH=../../.env.scrape-prod npx tsx scripts/apply-master-test-fixes.ts
import 'dotenv/config'; // must precede the @labprice/database import — PrismaClient reads DATABASE_URL at construction
import { prisma } from '@labprice/database';
import fixes from '../../../packages/database/data/2026-07-27-master-tests/fixes.json';

type Fix = {
  existing_test_name: string;
  field: string;
  current_value: string;
  corrected_value: string;
  severity: string;
  why: string;
  source: string;
};

const FIELD_MAP: Record<string, 'questCode' | 'labcorpCode' | 'name'> = {
  quest_code: 'questCode',
  labcorp_code: 'labcorpCode',
  name: 'name',
};

// Ordering constraint on fixes.json: each fix row is matched independently, by an exact lookup of
// `existing_test_name` against the CURRENT `tests.name` at the moment that row is processed (rows run
// top-to-bottom, no batching by test). So any fix that renames a test (`field: 'name'`) must be the
// LAST fix row for that test's original name in fixes.json — a later row keyed on the pre-rename name
// would look up a name that no longer exists and silently report SKIP (no matching test), not an
// error. (Today's fixes.json already satisfies this for "Testosterone Free Direct": its labcorp_code
// fix precedes its name-rename fix.) This is a data-ordering rule to preserve when editing fixes.json,
// not a reason to restructure the matching logic — independent per-row lookup-by-name is intentional.
async function main() {
  const apply = process.argv.includes('--apply');
  const rows = fixes as Fix[];

  let applied = 0, skippedNoMatch = 0, skippedNoOp = 0, skippedUnrecognized = 0;

  for (const fix of rows) {
    if (fix.severity === 'NO CHANGE') { skippedNoOp++; console.log(`NO-OP  (${fix.severity}) ${fix.existing_test_name} — ${fix.why}`); continue; }

    const test = await prisma.test.findFirst({ where: { name: fix.existing_test_name, deletedAt: null } });
    if (!test) { skippedNoMatch++; console.log(`SKIP   no test named "${fix.existing_test_name}" exists in the database`); continue; }

    const field = FIELD_MAP[fix.field];
    // Not a live case against today's fixes.json (every row's field is quest_code/labcorp_code/name),
    // but counted separately so the summary line's counters always sum to the total row count even if
    // a future fixes.json row has a typo'd/new field name.
    if (!field) { skippedUnrecognized++; console.log(`SKIP   unrecognized field "${fix.field}" on ${fix.existing_test_name}`); continue; }

    const before = (test as unknown as Record<string, string | null>)[field];
    const after = fix.corrected_value;
    if ((before ?? '') === after) { skippedNoOp++; console.log(`NO-OP  ${fix.existing_test_name}.${field} already "${after}"`); continue; }

    console.log(`${apply ? 'APPLY' : 'WOULD APPLY'} ${fix.existing_test_name}.${field}: "${before ?? ''}" -> "${after}"`);
    applied++;
    if (!apply) continue;

    await prisma.$transaction([
      prisma.test.update({ where: { id: test.id }, data: { [field]: after } }),
      prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'test.fix_applied',
          entityType: 'test',
          entityId: test.id,
          oldValues: { [field]: before },
          newValues: { [field]: after, severity: fix.severity, why: fix.why, source: fix.source },
        },
      }),
    ]);
  }

  console.log(`\n${applied} ${apply ? 'applied' : 'would apply'}, ${skippedNoMatch} skipped (no matching test), ${skippedNoOp} no-op, ${skippedUnrecognized} skipped (unrecognized field).`);
  if (!apply) console.log('Dry run only — re-run with --apply to write.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
