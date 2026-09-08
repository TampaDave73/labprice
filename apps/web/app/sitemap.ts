import { prisma } from '@labprice/database';
import type { MetadataRoute } from 'next';

// Rendered on demand (not at build) so the build needs no DB and the sitemap always reflects the
// current test/category set. It's cheap and infrequently hit (by crawlers).
export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tests, categories] = await Promise.all([
    prisma.test.findMany({
      where: { deletedAt: null },
      select: { slug: true, updatedAt: true },
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
  ]);

  const testEntries: MetadataRoute.Sitemap = tests.map((t) => ({
    url: `${BASE_URL}/test/${t.slug}`,
    lastModified: t.updatedAt,
    changeFrequency: 'daily' as const,
    priority: 0.8,
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
    ...categoryEntries,
    ...testEntries,
  ];
}
