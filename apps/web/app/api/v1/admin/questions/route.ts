// Admin review queue for harvested question candidates. List, and set a status.
//
// Nothing in this queue is public. Candidates arrive from
// apps/worker/scripts/harvest-questions.ts and go no further until someone acts on them here.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

const forbidden = () =>
  NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden();

  const status = req.nextUrl.searchParams.get('status') ?? 'NEW';

  // "Published" isn't a stored status — publishing happens in /admin/blog, which knows nothing about
  // this queue. Deriving it from the linked post means the two can never drift, and a candidate
  // stops sitting in Drafted forever once its article goes live.
  const all = await prisma.questionCandidate.findMany({
    orderBy: [{ score: 'desc' }, { capturedAt: 'desc' }],
    take: 500,
  });

  const postIds = all.map((c) => c.postId).filter((id): id is string => id != null);
  const posts = postIds.length
    ? await prisma.post.findMany({
        where: { id: { in: postIds } },
        select: { id: true, slug: true, isPublished: true, deletedAt: true },
      })
    : [];
  const byId = new Map(posts.map((p) => [p.id, p]));

  const enriched = all.map((c) => {
    const post = c.postId ? byId.get(c.postId) : undefined;
    const live = Boolean(post && post.isPublished && !post.deletedAt);
    return {
      ...c,
      postSlug: post?.slug ?? null,
      postPublished: live,
      // The bucket the UI groups by: DRAFTED means "written, not live yet".
      bucket: c.status === 'DRAFTED' && live ? 'PUBLISHED' : c.status,
    };
  });

  const counts: Record<string, number> = {};
  for (const c of enriched) counts[c.bucket] = (counts[c.bucket] ?? 0) + 1;

  return NextResponse.json({
    data: {
      candidates: status === 'ALL' ? enriched : enriched.filter((c) => c.bucket === status),
      counts,
    },
  });
}

const createSchema = z.object({
  title: z.string().trim().min(5).max(300),
  guidance: z.string().trim().max(2000).nullish(),
  matchedTests: z.array(z.string().trim()).max(20).default([]),
});

/** Add a question by hand — your own idea, not something harvested. */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden();

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid question', details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const { title, guidance, matchedTests } = parsed.data;

  const candidate = await prisma.questionCandidate.upsert({
    // Same identity rule as the harvester: the question text. Adding the same one twice updates it.
    where: { source_sourceId: { source: 'MANUAL', sourceId: title.toLowerCase() } },
    create: {
      source: 'MANUAL',
      sourceId: title.toLowerCase(),
      origin: 'added by hand',
      title,
      guidance: guidance?.trim() || null,
      matchedTests,
      // Yours by definition — no point making you approve your own idea.
      status: 'APPROVED',
    },
    update: { title, guidance: guidance?.trim() || null, matchedTests },
  });

  return NextResponse.json({ data: { candidate } }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(['NEW', 'APPROVED', 'REJECTED', 'DRAFTED']).optional(),
  notes: z.string().trim().max(2000).nullish(),
  guidance: z.string().trim().max(2000).nullish(),
});

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden();

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid update', details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const { id, status, notes, guidance } = parsed.data;

  const existing = await prisma.questionCandidate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: { code: 'not_found', message: 'Candidate not found' } }, { status: 404 });
  }

  const candidate = await prisma.questionCandidate.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(guidance !== undefined && { guidance: guidance?.trim() || null }),
    },
  });
  return NextResponse.json({ data: { candidate } });
}
