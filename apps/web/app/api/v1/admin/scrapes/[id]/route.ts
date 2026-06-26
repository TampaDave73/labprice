import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const { id } = await params;

  const run = await prisma.scrapeRun.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, name: true, slug: true } },
      results: {
        include: {
          test: { select: { id: true, name: true } },
          offering: { select: { id: true, currentPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      errors: true,
    },
  });

  if (!run) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Scrape run not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: run });
}
