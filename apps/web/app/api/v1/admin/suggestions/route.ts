// Admin view of user-submitted "Suggest a Vendor" / "Suggest a Test" leads from the site footer.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

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
  const where = status ? { status: status as 'PENDING' | 'REVIEWED' | 'DISMISSED' } : {};

  const [vendors, tests] = await Promise.all([
    prisma.vendorSuggestion.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.testSuggestion.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);

  return NextResponse.json({ data: { vendors, tests } });
}
