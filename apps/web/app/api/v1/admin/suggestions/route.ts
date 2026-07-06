// Admin view of user-submitted "Suggest a Vendor" / "Suggest a Test" leads from the site footer.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

const STATUSES = ['PENDING', 'REVIEWED', 'DISMISSED'] as const;
type Status = (typeof STATUSES)[number];

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get('status');
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: `Unknown status — expected one of ${STATUSES.join(', ')}` } },
      { status: 400 },
    );
  }
  const where = status ? { status: status as Status } : {};

  const [vendors, tests, reports] = await Promise.all([
    prisma.vendorSuggestion.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.testSuggestion.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.resultErrorReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        test: { select: { name: true, slug: true } },
        offering: { select: { vendor: { select: { name: true } } } },
      },
    }),
  ]);

  return NextResponse.json({ data: { vendors, tests, reports } });
}
