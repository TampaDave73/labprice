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
