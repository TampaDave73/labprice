// Turns raw AuditLog rows into readable sentences, shared by the dashboard's Recent Activity feed
// and the /admin/audit page. Audit rows store ids + JSON values (that's correct for auditing); the
// humanizing belongs at render time — e.g. a `price_published` row becomes
// "Vitamin D at Walk-In Lab: $64.00 → $59.00" instead of "price_published offering#cmr6sty0".
// Pure functions only — imported by both server components and client pages.

export type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: unknown;
  newValues: unknown;
  createdAt: Date | string;
  actor: { name: string | null; email: string } | null;
};

function json(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/**
 * Describe one audit row. `entityLabel` is the pre-resolved human name for the row's entity
 * (e.g. "Vitamin D at Walk-In Lab" for an offering) — callers batch-resolve those; null when the
 * entity was deleted or isn't a labelable type.
 */
export function describeAuditRow(log: AuditRow, entityLabel: string | null): { title: string; detail: string | null } {
  const who = log.actor?.name ?? log.actor?.email ?? null;
  switch (log.action) {
    case 'price_published': {
      const oldPrice = json(log.oldValues).price as string | null | undefined;
      const newPrice = json(log.newValues).price as string | undefined;
      const label = entityLabel ?? 'a delisted offering';
      return {
        title: `Price updated — ${label}`,
        detail: oldPrice ? `$${oldPrice} → $${newPrice}` : `first price: $${newPrice}`,
      };
    }
    case 'test_promoted': {
      const v = json(log.newValues);
      const from = Array.isArray(v.from) ? v.from : [];
      return {
        title: `Test created from discovered products — ${(v.name as string) ?? entityLabel ?? 'new test'}${who ? ` by ${who}` : ''}`,
        detail: from.length ? `from ${from.length} vendor product(s): ${from.slice(0, 3).join('; ')}${from.length > 3 ? '…' : ''}` : null,
      };
    }
    case 'products_attached':
    case 'products_listed': {
      const v = json(log.newValues);
      const products = Array.isArray(v.products) ? v.products : [];
      const verb = log.action === 'products_attached' ? 'attached to' : 'listed for';
      return {
        title: `${products.length} discovered product(s) ${verb} ${entityLabel ?? 'a test'}${who ? ` by ${who}` : ''}`,
        detail: `${v.offeringsCreated ?? 0} offering(s) created, ${v.aliasesLearned ?? 0} alias(es) learned`,
      };
    }
    case 'tests.csv_import': {
      const v = json(log.newValues);
      const cats = Array.isArray(v.newCategories) && v.newCategories.length ? `, ${v.newCategories.length} new categor${v.newCategories.length === 1 ? 'y' : 'ies'}` : '';
      return {
        title: `Tests CSV imported${who ? ` by ${who}` : ''}`,
        detail: `${v.created ?? 0} created, ${v.updated ?? 0} updated, ${v.unchanged ?? 0} unchanged${cats}`,
      };
    }
    case 'tests.master_import': {
      // 2026-07-27 master biomarker list (246 rows), applied by apps/worker/scripts/import-master-
      // tests.ts. `orphaned` = pre-existing tests whose slug wasn't in the master list — kept, never
      // deleted, just flagged. That list is durably re-recorded at
      // packages/database/data/2026-07-27-master-tests/orphaned-pre-existing-tests.json since this
      // audit row is otherwise the only place it lives.
      const v = json(log.newValues);
      const orphaned = Array.isArray(v.orphaned) ? (v.orphaned as string[]) : [];
      return {
        title: `Master test list imported${who ? ` by ${who}` : ''}`,
        detail: `${v.created ?? 0} created, ${v.updated ?? 0} updated${orphaned.length ? `, ${orphaned.length} existing test(s) not in the list (kept, flagged for review)` : ''}`,
      };
    }
    case 'test.fix_applied': {
      // apps/worker/scripts/apply-master-test-fixes.ts — one row per corrected field, run ahead of
      // tests.master_import. `newValues` holds the corrected field/value alongside severity/why/source;
      // the field name itself is dynamic (whichever key isn't one of those four).
      const v = json(log.newValues);
      const { severity, why, source, ...fieldChange } = v as { severity?: string; why?: string; source?: string; [k: string]: unknown };
      const [field, newValue] = Object.entries(fieldChange)[0] ?? [null, null];
      return {
        title: `Fix applied — ${entityLabel ?? 'a test'}${field ? `: ${field} → "${newValue}"` : ''}`,
        detail: [severity ? `severity: ${severity}` : null, why ?? null].filter(Boolean).join(' — ') || null,
      };
    }
    case 'test.merge_duplicate': {
      // apps/worker/scripts/merge-duplicate-tests.ts (2026-07-27) — reconciles a duplicate Test row the
      // master-list import created under a new slug for a test that already existed under a different
      // slug (same questCode/labcorpCode). The pre-existing row (with real Offering/PriceHistory data)
      // is kept and updated with the master row's researched fields; the empty duplicate is soft-
      // deleted. `entityLabel` here is the KEPT row's current name.
      const v = json(log.newValues);
      const old = json(log.oldValues);
      return {
        title: `Duplicate test merged — ${entityLabel ?? (v.keptSlug as string) ?? 'a test'}${who ? ` by ${who}` : ''}`,
        detail: `merged from "${v.mergedFromSlug ?? '?'}" (now removed); confidence ${old.confidence ?? '?'} → ${v.confidence ?? '?'}`,
      };
    }
    case 'offerings.audit_import': {
      // apps/api/v1/admin/offerings/import — the cross-vendor Offerings audit round-trip
      // (Export/Import Excel on /admin/offerings). Bulk external_url fixes and "deactivate" actions
      // in one file, across every vendor at once.
      const v = json(log.newValues);
      return {
        title: `Offerings audit import${who ? ` by ${who}` : ''}`,
        detail: `${v.updated ?? 0} updated, ${v.unchanged ?? 0} unchanged`,
      };
    }
    case 'analytics.reset': {
      const v = json(log.oldValues);
      return {
        title: `Analytics reset${who ? ` by ${who}` : ''}`,
        detail: `deleted ${v.searches ?? 0} searches, ${v.clicks ?? 0} clicks, ${v.pageViews ?? 0} page views`,
      };
    }
    default:
      // Unknown/future actions: still readable — "price published · offering" not "offering#cmr6sty0".
      return {
        title: `${log.action.replace(/[._]/g, ' ')} · ${entityLabel ?? log.entityType}${who ? ` — ${who}` : ''}`,
        detail: null,
      };
  }
}
