// Reverse lookups from tests to the articles that discuss them.
//
// Articles already link out to test pages heavily; nothing linked back. The 30 test pages are the
// site's strongest pages, so a one-way funnel wastes them — these queries are what let a test page,
// a category page and a sibling article surface the relevant guides.
//
// All of it reads `Post.relatedTests`, the same column that drives the "compare prices" cards, so
// the graph is maintained in exactly one place: set a post's related tests and every link in both
// directions follows.
import { prisma } from '@labprice/database';

export interface GuideLink {
  slug: string;
  title: string;
  excerpt: string;
}

const SELECT = { slug: true, title: true, excerpt: true } as const;
const LIVE = { isPublished: true, deletedAt: null } as const;

/** Guides that name this test. Used on `/test/[slug]`. */
export async function guidesForTest(testSlug: string, limit = 3): Promise<GuideLink[]> {
  try {
    return await prisma.post.findMany({
      where: { ...LIVE, relatedTests: { has: testSlug } },
      orderBy: { publishedAt: 'desc' },
      select: SELECT,
      take: limit,
    });
  } catch {
    // A guides strip is decoration on a price-comparison page — never let it take the page down.
    return [];
  }
}

/**
 * Guides covering any of these tests. Used on `/category/[slug]` with the category's test slugs.
 *
 * Ranked by how many of the category's tests each article actually covers, not by recency. Recency
 * ordering put a general article that happened to name one hormone at the top of /category/hormones,
 * which read (to a crawler quoting the first prose on the page) as the category being about that
 * article's subject. Overlap count is the closest thing to "how on-topic is this here".
 */
export async function guidesForTests(testSlugs: string[], limit = 3): Promise<GuideLink[]> {
  if (testSlugs.length === 0) return [];
  try {
    const candidates = await prisma.post.findMany({
      where: { ...LIVE, relatedTests: { hasSome: testSlugs } },
      orderBy: { publishedAt: 'desc' },
      select: { ...SELECT, relatedTests: true },
    });

    return candidates
      .map((p) => ({ post: p, shared: p.relatedTests.filter((t) => testSlugs.includes(t)).length }))
      // Stable within a tie: the findMany above already ordered newest-first.
      .sort((a, b) => b.shared - a.shared)
      .slice(0, limit)
      .map(({ post }) => ({ slug: post.slug, title: post.title, excerpt: post.excerpt }));
  } catch {
    return [];
  }
}

/**
 * Sibling articles, ranked by how many tests they share with this one — a proxy for topical overlap
 * that needs no hand-maintained "related posts" list and can't go stale as articles are added.
 * Falls back to the newest other articles when nothing overlaps, so a post is never a dead end.
 */
export async function relatedGuides(slug: string, relatedTests: string[], limit = 3): Promise<GuideLink[]> {
  try {
    const candidates = await prisma.post.findMany({
      where: { ...LIVE, slug: { not: slug } },
      orderBy: { publishedAt: 'desc' },
      select: { ...SELECT, relatedTests: true },
    });

    const scored = candidates
      .map((p) => ({ post: p, shared: p.relatedTests.filter((t) => relatedTests.includes(t)).length }))
      .sort((a, b) => b.shared - a.shared);

    return scored.slice(0, limit).map(({ post }) => ({ slug: post.slug, title: post.title, excerpt: post.excerpt }));
  } catch {
    return [];
  }
}
