// Reset all traffic analytics (searches, vendor clicks, page views) — the "start counting from
// zero" button on the admin Settings page. Deliberately does NOT touch price history, scrape
// history, or the audit log: those are business records, not traffic stats. Audit-logged so it's
// visible who wiped the counters and when.
import { NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

export async function POST() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const [searches, clicks, pageViews] = await prisma.$transaction([
    prisma.searchLog.deleteMany(),
    prisma.affiliateClick.deleteMany(),
    prisma.pageView.deleteMany(),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: 'analytics.reset',
      entityType: 'analytics',
      entityId: 'all',
      oldValues: { searches: searches.count, clicks: clicks.count, pageViews: pageViews.count },
    },
  });

  return NextResponse.json({
    data: { searches: searches.count, clicks: clicks.count, pageViews: pageViews.count },
  });
}
