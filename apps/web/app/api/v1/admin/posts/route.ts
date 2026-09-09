// Admin CRUD for blog posts. List + create here; update/delete in `[id]/route.ts`.
//
// Publishing revalidates the public paths so a post appears (or disappears) immediately rather than
// waiting on a cache — same pattern as the static pages route.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { postSchema, blank, revalidatePost } from '@/lib/blog-admin';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

const forbidden = () =>
  NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });

export async function GET() {
  if (!(await requireAdmin())) return forbidden();

  const posts = await prisma.post.findMany({
    where: { deletedAt: null },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, slug: true, title: true, excerpt: true, author: true, isPublished: true,
      publishedAt: true, updatedAt: true, heroUrl: true,
    },
  });
  return NextResponse.json({ data: { posts } });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden();

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid post', details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const clash = await prisma.post.findUnique({ where: { slug: d.slug }, select: { id: true } });
  if (clash) {
    return NextResponse.json({ error: { code: 'conflict', message: `A post with the slug "${d.slug}" already exists.` } }, { status: 409 });
  }

  const post = await prisma.post.create({
    data: {
      slug: d.slug,
      title: d.title,
      excerpt: d.excerpt,
      body: d.body,
      author: d.author,
      heroUrl: blank(d.heroUrl),
      heroAlt: blank(d.heroAlt),
      heroCredit: blank(d.heroCredit),
      faq: blank(d.faq),
      relatedTests: d.relatedTests,
      isPublished: d.isPublished,
      // publishedAt is the article's own date, set once when it first goes live — later edits update
      // `updatedAt`, not this, so a small fix doesn't re-date the piece.
      publishedAt: d.isPublished ? new Date() : null,
    },
  });

  revalidatePost(post.slug);
  return NextResponse.json({ data: { post } }, { status: 201 });
}
