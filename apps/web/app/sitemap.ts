import { prisma } from '@labprice/database';
import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tests, categories] = await Promise.all([
    prisma.test.findMany({
      where: { deletedAt: null },
      select: { slug: true, updatedAt: true },
    }),
    prisma.category.findMany({
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
