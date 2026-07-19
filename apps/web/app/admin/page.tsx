import { prisma } from '@labprice/database';

// Turn raw audit rows into readable sentences. Audit rows store ids + JSON values (that's correct
// for auditing); the humanizing belongs here at render time — e.g. a `price_published` row becomes
// "Vitamin D at Walk-In Lab: $64.00 → $59.00" instead of "price_published offering#cmr6sty0".
type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: unknown;
  newValues: unknown;
  createdAt: Date;
  actor: { name: string | null; email: string } | null;
};

function json(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export default async function AdminDashboard() {
  const [testCount, vendorCount, offeringCount, pendingCount, recentActivity] = await Promise.all([
    prisma.test.count({ where: { deletedAt: null } }),
    prisma.vendor.count({ where: { deletedAt: null } }),
    prisma.offering.count({ where: { isActive: true, deletedAt: null } }),
    prisma.stagedPriceChange.count({ where: { status: 'PENDING' } }),
    prisma.auditLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { name: true, email: true } } },
    }) as Promise<AuditRow[]>,
  ]);

  // Batch-resolve the offerings referenced by price events into "Test at Vendor" labels.
  const offeringIds = [...new Set(recentActivity.filter((a) => a.entityType === 'offering').map((a) => a.entityId))];
  const offerings = offeringIds.length
    ? await prisma.offering.findMany({
        where: { id: { in: offeringIds } },
        select: { id: true, test: { select: { name: true } }, vendor: { select: { name: true } } },
      })
    : [];
  const offeringLabel = new Map(offerings.map((o) => [o.id, `${o.test.name} at ${o.vendor.name}`]));

  const describe = (log: AuditRow): { title: string; detail: string | null } => {
    const who = log.actor?.name ?? log.actor?.email ?? null;
    switch (log.action) {
      case 'price_published': {
        const oldPrice = json(log.oldValues).price as string | null | undefined;
        const newPrice = json(log.newValues).price as string | undefined;
        const label = offeringLabel.get(log.entityId) ?? 'a delisted offering';
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
        return { title: `${log.action.replace(/[._]/g, ' ')} · ${log.entityType}${who ? ` — ${who}` : ''}`, detail: null };
    }
  };

  const kpis = [
    { label: 'Total Tests', value: testCount, color: 'text-brand-600' },
    { label: 'Total Vendors', value: vendorCount, color: 'text-brand-600' },
    { label: 'Active Offerings', value: offeringCount, color: 'text-success-700' },
    { label: 'Pending Changes', value: pendingCount, color: pendingCount > 0 ? 'text-amber-600' : 'text-brand-600' },
  ];

  return (
    <div>
      <h1 className="admin-h1 mb-6">Dashboard</h1>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="admin-card p-6">
            <p className="text-sm font-medium text-brand-400">{kpi.label}</p>
            <p className={`mt-1 text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="admin-card p-6">
        <h2 className="admin-h2 mb-4">Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-brand-400">No recent activity.</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((log) => {
              const { title, detail } = describe(log);
              return (
                <div key={log.id} className="flex items-start justify-between gap-4 border-b border-brand-50 pb-3 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-brand-900">{title}</p>
                    {detail && <p className="text-xs text-brand-400">{detail}</p>}
                  </div>
                  <time className="shrink-0 text-xs text-brand-400">
                    {new Date(log.createdAt).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </time>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
