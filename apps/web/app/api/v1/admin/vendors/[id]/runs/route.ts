// Recent scrape-run history for one vendor — the "live insight into scraping" the admin needs to see
// *why* a scrape failed without going to the DB directly. ScrapeRun + ScrapeError already capture this
// (e.g. "HTTP 403 for https://requestatest.com/tests"); this just surfaces it.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }
  const { id: vendorId } = await params;

  const runs = await prisma.scrapeRun.findMany({
    where: { vendorId },
    orderBy: { startedAt: 'desc' },
    take: 15,
    select: {
      id: true,
      status: true,
      testsFound: true,
      pricesUpdated: true,
      pricesUnchanged: true,
      errorsCount: true,
      durationMs: true,
      startedAt: true,
      completedAt: true,
      job: { select: { triggeredBy: true } },
      errors: { select: { message: true, errorType: true, url: true }, take: 5 },
    },
  });

  return NextResponse.json({ data: runs });
}
