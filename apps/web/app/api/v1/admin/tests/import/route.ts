import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { normalizeName } from '@labprice/scrapers/src/catalog/matcher';
import { parseWorkbookSheet } from '@/lib/xlsx';

// Excel import of the canonical tests layer, id-anchored. NEVER blind: the client first posts with
// apply:false and shows the returned diff (creates / field-level updates / unchanged / errors /
// categories to create); only a second post with apply:true executes — in one transaction, audit-
// logged. Import only creates and updates; deleting a test stays a deliberate UI action.
//
// Semantics per row:
//   id present → update that test (error if unknown/deleted id).
//   id blank   → create (name required; slug derived from name when blank; ≥1 category required).
// `categories`/`aliases` are pipe-separated FULL sets (replace, not merge) — what you see in the
// sheet is what the test has afterwards. Unknown category names are created on apply.

type RowPlan = {
  line: number; // 1-based sheet row (header = line 1) for human-readable errors
  action: 'create' | 'update';
  testId?: string;
  fields: {
    name: string;
    shortName: string;
    slug: string;
    questCode: string | null;
    labcorpCode: string | null;
    isPopular: boolean;
    categories: string[]; // category names, order preserved from the sheet
    aliases: string[];
    methodology: string | null;
    labVariant: string | null;
    cardioIq: boolean;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    thirdPartyOnly: boolean;
    notes: string | null;
    description: string | null;
    purpose: string | null;
    procedure: string | null;
    preparation: string | null;
    normalRange: string | null;
    displayOrder: number;
  };
  changes?: Record<string, { from: string; to: string }>; // updates only — human-readable diff
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const parseBool = (s: string) => ['true', '1', 'yes', 'y', 'x'].includes(s.toLowerCase());

const splitPipes = (s: string) => s.split('|').map((p) => p.trim()).filter(Boolean);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const apply = form?.get('apply') === 'true';
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: { code: 'validation_error', message: 'Body must include a file.' } }, { status: 400 });
  }

  const parsed = await parseWorkbookSheet(await file.arrayBuffer(), 'Tests').catch(() => ({ error: "Could not read that file as an Excel workbook. Start from an Export to get a file in the right shape." }));
  if ('error' in parsed) {
    return NextResponse.json({ error: { code: 'validation_error', message: parsed.error } }, { status: 400 });
  }
  const { header, records } = parsed;

  const required = ['name'];
  const missing = required.filter((c) => !header.includes(c));
  if (records.length === 0 || missing.length > 0) {
    const msg = records.length === 0
      ? 'The Tests sheet has no data rows.'
      : `The Tests sheet is missing required column(s): ${missing.join(', ')}. Start from an export to get the right columns.`;
    return NextResponse.json({ error: { code: 'validation_error', message: msg } }, { status: 400 });
  }
  if (records.length > 2000) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'More than 2,000 rows — split it up.' } }, { status: 400 });
  }

  const [tests, categories] = await Promise.all([
    prisma.test.findMany({
      where: { deletedAt: null },
      include: {
        categories: { include: { category: { select: { name: true, displayOrder: true } } } },
        category: { select: { name: true, displayOrder: true } },
        aliases: { select: { alias: true, normalized: true } },
      },
    }),
    prisma.category.findMany({ select: { id: true, name: true, displayOrder: true } }),
  ]);
  const testById = new Map(tests.map((t) => [t.id, t]));
  const slugOwner = new Map(tests.map((t) => [t.slug, t.id]));
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  const errors: { line: number; message: string }[] = [];
  const plans: RowPlan[] = [];
  const newCategories = new Set<string>();
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  let unchanged = 0;

  records.forEach((rec, i) => {
    const line = i + 2;
    const id = rec.id ?? '';
    const name = rec.name ?? '';
    if (!name) { errors.push({ line, message: 'Missing name.' }); return; }

    const existing = id ? testById.get(id) : undefined;
    if (id && !existing) { errors.push({ line, message: `No test with id ${id} (deleted or wrong id).` }); return; }
    if (id && seenIds.has(id)) { errors.push({ line, message: `Duplicate id ${id} in the file.` }); return; }
    if (id) seenIds.add(id);

    const slug = (rec.slug ?? '') || (existing ? existing.slug : slugify(name));
    if (!slug) { errors.push({ line, message: 'Missing slug (and name produced an empty one).' }); return; }
    const owner = slugOwner.get(slug);
    if (owner && owner !== existing?.id) { errors.push({ line, message: `Slug "${slug}" already belongs to another test.` }); return; }
    if (seenSlugs.has(slug)) { errors.push({ line, message: `Duplicate slug "${slug}" in the file.` }); return; }
    seenSlugs.add(slug);

    const existingCatNames = existing ? (existing.categories.length ? existing.categories.map((tc) => tc.category.name) : [existing.category.name]) : [];
    const catNames = 'categories' in rec ? splitPipes(rec.categories ?? '') : existingCatNames;
    if (catNames.length === 0) { errors.push({ line, message: 'At least one category is required.' }); return; }
    for (const c of catNames) if (!categoryByName.has(c.toLowerCase())) newCategories.add(c);

    const fields: RowPlan['fields'] = {
      name,
      shortName: (rec.short_name ?? '') || (existing ? existing.shortName : name),
      slug,
      questCode: 'quest_code' in rec ? (rec.quest_code || null) : (existing?.questCode ?? null),
      labcorpCode: 'labcorp_code' in rec ? (rec.labcorp_code || null) : (existing?.labcorpCode ?? null),
      isPopular: 'is_popular' in rec ? parseBool(rec.is_popular ?? '') : (existing?.isPopular ?? false),
      categories: catNames,
      aliases: 'aliases' in rec ? splitPipes(rec.aliases ?? '') : (existing?.aliases ?? []).map((a) => a.alias),
      methodology: 'methodology' in rec ? (rec.methodology || null) : (existing?.methodology ?? null),
      labVariant: 'lab_variant' in rec ? (rec.lab_variant || null) : (existing?.labVariant ?? null),
      cardioIq: 'cardio_iq' in rec ? parseBool(rec.cardio_iq ?? '') : (existing?.cardioIq ?? false),
      confidence: 'confidence' in rec ? (rec.confidence.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW') : (existing?.confidence ?? 'LOW'),
      thirdPartyOnly: 'third_party_only' in rec ? parseBool(rec.third_party_only ?? '') : (existing?.thirdPartyOnly ?? false),
      notes: 'notes' in rec ? (rec.notes || null) : (existing?.notes ?? null),
      description: 'description' in rec ? (rec.description || null) : (existing?.description ?? null),
      purpose: 'purpose' in rec ? (rec.purpose || null) : (existing?.purpose ?? null),
      procedure: 'procedure' in rec ? (rec.procedure || null) : (existing?.procedure ?? null),
      preparation: 'preparation' in rec ? (rec.preparation || null) : (existing?.preparation ?? null),
      normalRange: 'normal_range' in rec ? (rec.normal_range || null) : (existing?.normalRange ?? null),
      // Blank keeps the current value rather than resetting to 0 — an operator clearing a cell means
      // "leave it alone", not "send this test to the top of every listing".
      displayOrder: 'display_order' in rec && String(rec.display_order ?? '').trim() !== ''
        ? (Number.parseInt(String(rec.display_order), 10) || 0)
        : (existing?.displayOrder ?? 0),
    };

    if (!existing) {
      plans.push({ line, action: 'create', fields });
      return;
    }

    // Field-level diff, so the preview shows exactly what a save would change.
    const changes: Record<string, { from: string; to: string }> = {};
    const cmp = (key: string, from: string | null, to: string | null) => {
      if ((from ?? '') !== (to ?? '')) changes[key] = { from: from ?? '', to: to ?? '' };
    };
    cmp('name', existing.name, fields.name);
    cmp('short_name', existing.shortName, fields.shortName);
    cmp('slug', existing.slug, fields.slug);
    cmp('quest_code', existing.questCode, fields.questCode);
    cmp('labcorp_code', existing.labcorpCode, fields.labcorpCode);
    cmp('is_popular', String(existing.isPopular), String(fields.isPopular));
    cmp('methodology', existing.methodology, fields.methodology);
    cmp('lab_variant', existing.labVariant, fields.labVariant);
    cmp('cardio_iq', String(existing.cardioIq), String(fields.cardioIq));
    cmp('confidence', existing.confidence, fields.confidence);
    cmp('third_party_only', String(existing.thirdPartyOnly), String(fields.thirdPartyOnly));
    cmp('notes', existing.notes, fields.notes);
    cmp('description', existing.description, fields.description);
    cmp('purpose', existing.purpose, fields.purpose);
    cmp('procedure', existing.procedure, fields.procedure);
    cmp('preparation', existing.preparation, fields.preparation);
    cmp('normal_range', existing.normalRange, fields.normalRange);
    cmp('display_order', String(existing.displayOrder), String(fields.displayOrder));
    const oldCats = [...existingCatNames].sort().join('|');
    const newCats = [...fields.categories].sort().join('|');
    if (oldCats.toLowerCase() !== newCats.toLowerCase()) changes.categories = { from: oldCats, to: newCats };
    const oldAliases = (existing.aliases ?? []).map((a) => a.normalized).sort().join('|');
    const newAliases = [...new Set(fields.aliases.map(normalizeName))].sort().join('|');
    if (oldAliases !== newAliases) {
      changes.aliases = { from: (existing.aliases ?? []).map((a) => a.alias).join('|'), to: fields.aliases.join('|') };
    }

    if (Object.keys(changes).length === 0) { unchanged++; return; }
    plans.push({ line, action: 'update', testId: existing.id, fields, changes });
  });

  const summary = {
    creates: plans.filter((p) => p.action === 'create').map((p) => ({ line: p.line, name: p.fields.name, slug: p.fields.slug, categories: p.fields.categories })),
    updates: plans.filter((p) => p.action === 'update').map((p) => ({ line: p.line, id: p.testId, name: p.fields.name, changes: p.changes })),
    unchanged,
    errors,
    newCategories: [...newCategories],
    applied: false,
  };

  // Dry run, or nothing to do, or blocked by errors: report only. Errors block apply entirely —
  // a half-imported sheet is worse than a rejected one (fix the file, re-upload).
  if (!apply || errors.length > 0 || plans.length === 0) {
    return NextResponse.json({ data: summary }, { status: !apply || errors.length === 0 ? 200 : 422 });
  }

  await prisma.$transaction(async (tx) => {
    // 1. Create any categories the sheet references that don't exist yet (appended after existing).
    let nextOrder = Math.max(0, ...categories.map((c) => c.displayOrder)) + 1;
    for (const catName of newCategories) {
      const created = await tx.category.create({
        data: { name: catName, slug: slugify(catName), displayOrder: nextOrder++ },
      });
      categoryByName.set(catName.toLowerCase(), { id: created.id, name: created.name, displayOrder: created.displayOrder });
    }

    for (const plan of plans) {
      const cats = plan.fields.categories.map((n) => categoryByName.get(n.toLowerCase())!);
      // Same rule as the test editor: categoryId is the DERIVED display pointer — lowest displayOrder.
      const displayCategoryId = [...cats].sort((a, b) => a.displayOrder - b.displayOrder)[0]!.id;
      const data = {
        name: plan.fields.name,
        shortName: plan.fields.shortName,
        slug: plan.fields.slug,
        questCode: plan.fields.questCode,
        labcorpCode: plan.fields.labcorpCode,
        isPopular: plan.fields.isPopular,
        categoryId: displayCategoryId,
        methodology: plan.fields.methodology,
        labVariant: plan.fields.labVariant,
        cardioIq: plan.fields.cardioIq,
        confidence: plan.fields.confidence,
        thirdPartyOnly: plan.fields.thirdPartyOnly,
        notes: plan.fields.notes,
        description: plan.fields.description,
        purpose: plan.fields.purpose,
        procedure: plan.fields.procedure,
        preparation: plan.fields.preparation,
        normalRange: plan.fields.normalRange,
        displayOrder: plan.fields.displayOrder,
      };

      const testId = plan.action === 'create'
        ? (await tx.test.create({ data })).id
        : (await tx.test.update({ where: { id: plan.testId! }, data })).id;

      // Replace the category set (the sheet is the full truth for these columns).
      await tx.testCategory.deleteMany({ where: { testId } });
      await tx.testCategory.createMany({ data: cats.map((c) => ({ testId, categoryId: c.id })), skipDuplicates: true });

      // Replace aliases, deduped on the normalized key; re-created rows are attributed to the csv.
      await tx.testAlias.deleteMany({ where: { testId } });
      const seen = new Set<string>();
      const aliasRows = plan.fields.aliases
        .map((a) => ({ testId, alias: a, normalized: normalizeName(a), source: 'csv' }))
        .filter((a) => a.normalized && !seen.has(a.normalized) && seen.add(a.normalized));
      if (aliasRows.length > 0) await tx.testAlias.createMany({ data: aliasRows });
    }

    await tx.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'tests.csv_import',
        entityType: 'test',
        entityId: 'bulk',
        newValues: {
          created: summary.creates.length,
          updated: summary.updates.length,
          unchanged,
          newCategories: summary.newCategories,
        },
      },
    });
  });

  return NextResponse.json({ data: { ...summary, applied: true } });
}
