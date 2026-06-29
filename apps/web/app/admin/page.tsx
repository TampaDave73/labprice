import { prisma } from '@labprice/database';

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
    }),
  ]);

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
            {recentActivity.map((log) => (
              <div key={log.id} className="flex items-start justify-between border-b border-brand-50 pb-3 last:border-0">
                <div>
                  <p className="text-sm text-brand-900">
                    <span className="font-medium">{log.actor?.name ?? log.actor?.email ?? 'System'}</span>{' '}
                    <span className="text-brand-400">{log.action}</span>{' '}
                    <span className="text-brand-600">{log.entityType}#{log.entityId.slice(0, 8)}</span>
                  </p>
                </div>
                <time className="shrink-0 text-xs text-brand-400">
                  {new Date(log.createdAt).toLocaleDateString()}
                </time>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
