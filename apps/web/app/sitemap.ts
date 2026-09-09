import { prisma } from '@labprice/database';
import type { MetadataRoute } from 'next';

// Rendered on demand (not at build) so the build needs no DB and the sitemap always reflects the
// current test/category set. It's cheap and infrequently hit (by crawlers).
export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tests, categories, posts] = await Promise.all([
    prisma.test.findMany({
      where: { deletedAt: null },
      select: {
        slug: true,
        updatedAt: true,
        // lastModified should track price freshness, which is what actually changes daily here.
        // `test.updatedAt` only moves when an admin edits the test's own copy, so on its own it
        // reported a page as unchanged for months while its prices were re-verified nightly.
        offerings: {
          where: { isActive: true, deletedAt: null, vendor: { isActive: true, deletedAt: null } },
          select: { lastCheckedAt: true },
          orderBy: { lastCheckedAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.category.findMany({
      // Only categories with at least one live test — matches the homepage filter (page.tsx,
      // fixed in the prior commit). The 2026-09-07 catalog reset cut the catalog to 30 tests
      // spanning 16 of 21 categories; the other 5 still render (category/[slug]/page.tsx has no
      // "empty" guard) as thin, empty listing pages, so the sitemap must not advertise them.
      // Rows stay in the DB (real membership lives in TestCategory, and admin lists are
      // untouched) so widening the catalog later needs no reseed.
      where: { testCategories: { some: { test: { deletedAt: null } } } },
      select: { slug: true, updatedAt: true },
    }),
    prisma.post.findMany({
      where: { isPublished: true, deletedAt: null },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const testEntries: MetadataRoute.Sitemap = tests.map((t) => ({
    url: `${BASE_URL}/test/${t.slug}`,
    lastModified: t.offerings[0]?.lastCheckedAt ?? t.updatedAt,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  // Static routes. /order-services is a real content page (every vendor + their catalog) and was
  // simply missing; the legal pages are low-priority but should still be discoverable.
  const postEntries: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${BASE_URL}/blog/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  const staticEntries: MetadataRoute.Sitemap = [
    { path: '/order-services', changeFrequency: 'daily' as const, priority: 0.7 },
    { path: '/blog', changeFrequency: 'weekly' as const, priority: 0.6 },
    { path: '/about', changeFrequency: 'monthly' as const, priority: 0.5 },
    { path: '/editorial-policy', changeFrequency: 'monthly' as const, priority: 0.4 },
    { path: '/contact', changeFrequency: 'yearly' as const, priority: 0.4 },
    { path: '/disclaimer', changeFrequency: 'yearly' as const, priority: 0.3 },
    { path: '/privacy', changeFrequency: 'yearly' as const, priority: 0.3 },
    { path: '/terms', changeFrequency: 'yearly' as const, priority: 0.3 },
  ].map((e) => ({
    url: `${BASE_URL}${e.path}`,
    lastModified: new Date(),
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));

  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${BASE_URL}/category/${c.slug}`,
    lastModified: c.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    ...staticEntries,
    ...categoryEntries,
    ...testEntries,
    ...postEntries,
  ];
}
