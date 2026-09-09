// Read / update / soft-delete one blog post. See ../route.ts for the shared schema and the
// revalidation helper.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { postSchema, blank, revalidatePost } from '@/lib/blog-admin';

interface Ctx {
  params: Promise<{ id: string }>;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

const forbidden = () =>
  NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
const missing = () =>
  NextResponse.json({ error: { code: 'not_found', message: 'Post not found' } }, { status: 404 });

export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;

  const post = await prisma.post.findFirst({ where: { id, deletedAt: null } });
  if (!post) return missing();
  return NextResponse.json({ data: { post } });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;

  const existing = await prisma.post.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return missing();

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid post', details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (d.slug !== existing.slug) {
    const clash = await prisma.post.findUnique({ where: { slug: d.slug }, select: { id: true } });
    if (clash) {
      return NextResponse.json({ error: { code: 'conflict', message: `A post with the slug "${d.slug}" already exists.` } }, { status: 409 });
    }
  }

  const post = await prisma.post.update({
    where: { id },
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
      // Stamped on first publish only. Unpublishing keeps the original date so re-publishing doesn't
      // present an old article as new.
      publishedAt: d.isPublished ? existing.publishedAt ?? new Date() : existing.publishedAt,
    },
  });

  revalidatePost(post.slug);
  if (d.slug !== existing.slug) revalidatePost(existing.slug); // clear the old URL too
  return NextResponse.json({ data: { post } });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;

  const existing = await prisma.post.findFirst({ where: { id, deletedAt: null }, select: { slug: true } });
  if (!existing) return missing();

  // Soft delete + unpublish: the row stays for recovery, the page stops resolving immediately.
  await prisma.post.update({ where: { id }, data: { deletedAt: new Date(), isPublished: false } });
  revalidatePost(existing.slug);
  return NextResponse.json({ data: { deleted: true } });
}
