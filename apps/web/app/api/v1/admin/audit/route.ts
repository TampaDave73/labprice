import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

// Searchable audit trail for /admin/audit: filter by action / entity type / actor / date range,
// offset-paginated. Also returns the filter vocabularies (distinct actions, entity types, actors)
// so the UI's dropdowns reflect what's actually in the log, and a label map resolving the current
// page's entity ids to human names ("Vitamin D at Walk-In Lab") — ids alone are useless to read.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const action = params.get('action');
  const entityType = params.get('entityType');
  const actorId = params.get('actorId');
  const from = params.get('from');
  const to = params.get('to');
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const limit = Math.min(Math.max(1, Number(params.get('limit') ?? 50) || 50), 200);

  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (actorId) where.actorId = actorId === 'system' ? null : actorId; // "system" = rows with no actor (scraper/worker writes)
  if (from || to) {
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = new Date(from);
    // `to` is a date-only input meaning "through that day" — push it to end-of-day so the day itself is included.
    if (to) range.lte = new Date(`${to}T23:59:59.999`);
    where.createdAt = range;
  }

  const [total, rows, actionGroups, typeGroups, actorGroups] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } }),
    prisma.auditLog.groupBy({ by: ['entityType'], orderBy: { entityType: 'asc' } }),
    prisma.auditLog.groupBy({ by: ['actorId'], orderBy: { actorId: 'asc' } }),
  ]);

  const actorIds = actorGroups.map((g) => g.actorId).filter((id): id is string => !!id);
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
    : [];

  // Resolve this page's entity ids to labels. Only the types we can name — unknown types render raw.
  const idsByType = new Map<string, string[]>();
  for (const r of rows) {
    const arr = idsByType.get(r.entityType) ?? [];
    arr.push(r.entityId);
    idsByType.set(r.entityType, arr);
  }
  const labels: Record<string, string> = {};
  const [offerings, tests, vendors] = await Promise.all([
    idsByType.has('offering')
      ? prisma.offering.findMany({
          where: { id: { in: idsByType.get('offering')! } },
          select: { id: true, test: { select: { name: true } }, vendor: { select: { name: true } } },
        })
      : [],
    idsByType.has('test')
      ? prisma.test.findMany({ where: { id: { in: idsByType.get('test')! } }, select: { id: true, name: true } })
      : [],
    idsByType.has('vendor')
      ? prisma.vendor.findMany({ where: { id: { in: idsByType.get('vendor')! } }, select: { id: true, name: true } })
      : [],
  ]);
  for (const o of offerings) labels[o.id] = `${o.test.name} at ${o.vendor.name}`;
  for (const t of tests) labels[t.id] = t.name;
  for (const v of vendors) labels[v.id] = v.name;

  return NextResponse.json({
    data: rows,
    labels,
    total,
    page,
    limit,
    meta: {
      actions: actionGroups.map((g) => g.action),
      entityTypes: typeGroups.map((g) => g.entityType),
      actors,
      // True when any row was written with no actor (system/scraper) so the UI can offer a "System" option.
      hasSystemActor: actorGroups.some((g) => g.actorId === null),
    },
  });
}
