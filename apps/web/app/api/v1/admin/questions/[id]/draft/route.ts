// Turns one approved question into an UNPUBLISHED draft post.
//
// The draft is deliberately not published and this route has no way to publish it — a human reads it
// at /admin/blog and decides. That gate is what separates "topic research with AI assistance" from
// the scaled-content-abuse pattern, and it should stay.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { generateArticleDraft, hasAnthropicKey } from '@/lib/ai/article-draft';

interface Ctx {
  params: Promise<{ id: string }>;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return null;
  return session;
}

// A drafted article has no photo of its own, and a hero-less card on /blog looks broken next to the
// others. These are the generic lab images in public/blog; one is picked from the slug so it is
// stable across redraws and varies between articles. Swap it for something specific in /admin/blog.
const GENERIC_HEROES = [
  { file: 'generic-laboratory', alt: 'A microscope on a laboratory bench.' },
  { file: 'generic-test-tube', alt: 'A gloved hand holding a laboratory test tube.' },
  { file: 'generic-lab-supplies', alt: 'Laboratory sample collection supplies on a white surface.' },
];

function pickHero(slug: string) {
  const n = [...slug].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const hero = GENERIC_HEROES[n % GENERIC_HEROES.length]!;
  return { heroUrl: `/blog/${hero.file}-1600.webp`, heroAlt: hero.alt, heroCredit: 'Photo: Unsplash' };
}

/** Appends -2, -3 … until the slug is free, so a second draft on a similar topic doesn't 409. */
async function uniqueSlug(base: string): Promise<string> {
  let slug = base || 'draft';
  for (let n = 2; n < 50; n += 1) {
    const clash = await prisma.post.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'Admin access required' } }, { status: 403 });
  }
  if (!hasAnthropicKey()) {
    return NextResponse.json(
      { error: { code: 'not_configured', message: 'ANTHROPIC_API_KEY is not set, so drafting is unavailable.' } },
      { status: 503 },
    );
  }

  const { id } = await params;
  const candidate = await prisma.questionCandidate.findUnique({ where: { id } });
  if (!candidate) {
    return NextResponse.json({ error: { code: 'not_found', message: 'Candidate not found' } }, { status: 404 });
  }
  if (candidate.postId) {
    return NextResponse.json(
      { error: { code: 'conflict', message: 'A draft has already been created from this question.' } },
      { status: 409 },
    );
  }

  // Only tests with a live price are offered: an article that links to a page with nothing to
  // compare wastes the click.
  const tests = await prisma.test.findMany({
    where: {
      deletedAt: null,
      offerings: { some: { isActive: true, deletedAt: null, currentPrice: { not: null }, vendor: { isActive: true, deletedAt: null } } },
    },
    select: { slug: true, name: true },
    orderBy: { name: 'asc' },
  });

  try {
    const draft = await generateArticleDraft(candidate.title, candidate.origin ?? 'an online health community', tests);
    const slug = await uniqueSlug(draft.slug);

    const post = await prisma.post.create({
      data: {
        slug,
        title: draft.title,
        excerpt: draft.excerpt,
        body: draft.body,
        faq: draft.faq,
        author: 'Dave S.',
        ...pickHero(slug),
        relatedTests: draft.relatedTests.length ? draft.relatedTests : candidate.matchedTests,
        isPublished: false, // never auto-publish — see the note at the top of this file
      },
    });

    await prisma.questionCandidate.update({
      where: { id },
      data: { status: 'DRAFTED', postId: post.id },
    });

    return NextResponse.json({ data: { postId: post.id, slug: post.slug, title: post.title } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Draft generation failed';
    return NextResponse.json({ error: { code: 'draft_failed', message } }, { status: 502 });
  }
}
