import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { publishStagedChange } from '@/lib/publish-change';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const params = req.nextUrl.searchParams;
  const status = params.get('status') as 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED' | null;
  const limit = Math.min(Number(params.get('limit') ?? 25), 100);
  const cursor = params.get('cursor');

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const changes = await prisma.stagedPriceChange.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      offering: {
        include: {
          test: { select: { id: true, name: true } },
          vendor: { select: { id: true, name: true, slug: true, websiteUrl: true } },
        },
      },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const hasMore = changes.length > limit;
  const data = hasMore ? changes.slice(0, limit) : changes;
  const nextCursor = hasMore ? data[data.length - 1]!.id : undefined;

  return NextResponse.json({ data, nextCursor });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Admin access required' } },
      { status: 403 },
    );
  }

  const body = await req.json();
  const { action, ids, overridePrice } = body as { action: 'approve' | 'reject' | 'clear'; ids?: string[]; overridePrice?: number };

  if (action === 'clear') {
    const { count } = await prisma.stagedPriceChange.deleteMany({ where: { status: 'PENDING' } });
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'staged_changes_cleared',
        entityType: 'staged_price_change',
        entityId: 'bulk',
        newValues: { count },
      },
    });
    return NextResponse.json({ data: { cleared: count } });
  }

  if (!action || !['approve', 'reject'].includes(action) || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Body must include action (approve|reject) and non-empty ids array' } },
      { status: 400 },
    );
  }

  // Reviewer can correct the scraped price before approving (e.g. the scraper caught a sale price
  // that already expired). Only meaningful for a single row — a bulk override would apply one number
  // to every selected change, which is never what's wanted. Recorded in reviewNote so the originally
  // scraped value isn't lost, just superseded.
  if (action === 'approve' && overridePrice != null && ids.length === 1) {
    if (!(overridePrice > 0)) {
      return NextResponse.json({ error: { code: 'validation_error', message: 'overridePrice must be a positive number' } }, { status: 400 });
    }
    const original = await prisma.stagedPriceChange.findUnique({ where: { id: ids[0] }, select: { newPrice: true, status: true, reviewNote: true } });
    if (original?.status === 'PENDING') {
      // Append rather than replace — reviewNote can carry a "@ <url>" discovered-URL marker from
      // catalog discovery that publishStagedChange still needs to read on approve.
      const overrideNote = `Reviewer override: scraper saw $${Number(original.newPrice).toFixed(2)}, approved at $${overridePrice.toFixed(2)}.`;
      // status: 'PENDING' guard in the WHERE (not just the read above) — a concurrent reject of this
      // same row between the read and this write would otherwise still get overwritten here.
      await prisma.stagedPriceChange.updateMany({
        where: { id: ids[0]!, status: 'PENDING' },
        data: {
          newPrice: overridePrice,
          reviewNote: original.reviewNote ? `${original.reviewNote} | ${overrideNote}` : overrideNote,
        },
      });
    }
  }

  const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';

  const updated = await prisma.stagedPriceChange.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data: {
      status: newStatus as 'APPROVED' | 'REJECTED',
      reviewedById: session.user.id,
      reviewedAt: new Date(),
    },
  });

  // If approving, publish the new prices to the live offerings right here (no worker needed).
  let published = 0;
  if (action === 'approve') {
    for (const id of ids) {
      if (await publishStagedChange(id)) published++;
    }
  }

  return NextResponse.json({ data: { updated: updated.count, published, action } });
}
