import Link from 'next/link';
import { prisma, getVendorTrustMap } from '@labprice/database';
import { describeAuditRow, type AuditRow } from '@/lib/audit-describe';

const DAY_MS = 86_400_000;

export default async function AdminDashboard() {
  const weekAgo = new Date(Date.now() - 7 * DAY_MS);

  const [
    testCount,
    vendorCount,
    offeringCount,
    pendingCount,
    recentActivity,
    pendingVendorSuggestions,
    pendingTestSuggestions,
    pendingErrorReports,
    failedRuns,
    activeVendors,
  ] = await Promise.all([
    prisma.test.count({ where: { deletedAt: null } }),
    prisma.vendor.count({ where: { deletedAt: null } }),
    prisma.offering.count({ where: { isActive: true, deletedAt: null } }),
    prisma.stagedPriceChange.count({ where: { status: 'PENDING' } }),
    prisma.auditLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { name: true, email: true } } },
    }) as Promise<AuditRow[]>,
    prisma.vendorSuggestion.count({ where: { status: 'PENDING' } }),
    prisma.testSuggestion.count({ where: { status: 'PENDING' } }),
    prisma.resultErrorReport.count({ where: { status: 'PENDING' } }),
    prisma.scrapeRun.findMany({
      where: { status: 'FAILED', createdAt: { gte: weekAgo } },
      select: { vendor: { select: { name: true } } },
    }),
    prisma.vendor.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, trustOverride: true },
    }),
  ]);

  const pendingSuggestions = pendingVendorSuggestions + pendingTestSuggestions + pendingErrorReports;
  const failingVendors = [...new Set(failedRuns.map((r) => r.vendor.name))];

  // Effective trust = override ?? computed (same rule as the vendor list, batched to 2 queries).
  const computedTrust = await getVendorTrustMap(activeVendors.filter((v) => !v.trustOverride).map((v) => v.id));
  const lowTrustVendors = activeVendors
    .filter((v) => (v.trustOverride ?? computedTrust.get(v.id) ?? 'MEDIUM') === 'LOW')
    .map((v) => v.name);

  // Batch-resolve the offerings referenced by price events into "Test at Vendor" labels.
  const offeringIds = [...new Set(recentActivity.filter((a) => a.entityType === 'offering').map((a) => a.entityId))];
  const offerings = offeringIds.length
    ? await prisma.offering.findMany({
        where: { id: { in: offeringIds } },
        select: { id: true, test: { select: { name: true } }, vendor: { select: { name: true } } },
      })
    : [];
  const offeringLabel = new Map(offerings.map((o) => [o.id, `${o.test.name} at ${o.vendor.name}`]));

  // "What needs me today": each card is a count of work waiting + a link straight to the filtered
  // view. Green (zero) cards stay visible so an all-clear is explicit, not just an empty page.
  const attention = [
    {
      label: 'Pending price changes',
      count: pendingCount,
      href: '/admin/changes?status=PENDING',
      hint: 'awaiting review in the Change Queue',
    },
    {
      label: 'Low-trust vendors',
      count: lowTrustVendors.length,
      href: '/admin/vendors?sort=trust&dir=asc',
      hint: lowTrustVendors.length ? lowTrustVendors.join(', ') : 'all vendors MEDIUM or better',
    },
    {
      label: 'Scrape failures (7d)',
      count: failedRuns.length,
      href: '/admin/vendors?sort=trust&dir=asc',
      hint: failingVendors.length ? failingVendors.join(', ') : 'no failed runs this week',
    },
    {
      label: 'Pending suggestions',
      count: pendingSuggestions,
      href: '/admin/suggestions?status=PENDING',
      hint: 'suggestions + error reports to triage',
    },
  ];

  const kpis = [
    { label: 'Total Tests', value: testCount },
    { label: 'Total Vendors', value: vendorCount },
    { label: 'Active Offerings', value: offeringCount },
  ];

  return (
    <div>
      <h1 className="admin-h1 mb-6">Dashboard</h1>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-400">Needs attention</h2>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {attention.map((a) => (
          <Link key={a.label} href={a.href} className="admin-card block p-5 transition-shadow hover:shadow-md">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-brand-600">{a.label}</p>
              <p className={`text-2xl font-bold ${a.count > 0 ? 'text-amber-600' : 'text-success-700'}`}>{a.count}</p>
            </div>
            <p className="mt-1 truncate text-xs text-brand-400" title={a.hint}>{a.hint}</p>
          </Link>
        ))}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="admin-card p-6">
            <p className="text-sm font-medium text-brand-400">{kpi.label}</p>
            <p className="mt-1 text-3xl font-bold text-brand-600">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="admin-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="admin-h2">Recent Activity</h2>
          <Link href="/admin/audit" className="text-sm font-medium text-brand-600 hover:text-brand-900">
            View all →
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-brand-400">No recent activity.</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((log) => {
              const { title, detail } = describeAuditRow(log, offeringLabel.get(log.entityId) ?? null);
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
