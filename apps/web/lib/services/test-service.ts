import { prisma, Prisma } from '@labprice/database';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@labprice/shared';
import type { TestSummaryDTO } from '@labprice/shared';

export type TestSort = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc';

interface GetTestsParams {
  category?: string;
  sort?: TestSort;
  cursor?: string;
  limit?: number;
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64').toString('utf-8');
}

function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64');
}

export async function getTests(params: GetTestsParams) {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  const orderBy: Prisma.TestOrderByWithRelationInput[] = (() => {
    switch (params.sort) {
      case 'name-desc':
        return [{ name: 'desc' as const }, { id: 'asc' as const }];
      case 'price-asc':
        return [{ displayOrder: 'asc' as const }, { id: 'asc' as const }];
      case 'price-desc':
        return [{ displayOrder: 'desc' as const }, { id: 'asc' as const }];
      case 'name-asc':
      default:
        return [{ name: 'asc' as const }, { id: 'asc' as const }];
    }
  })();

  const where: Prisma.TestWhereInput = {
    deletedAt: null,
    // Filter via the many-to-many join, not the singular `category` FK (which is only the
    // derived display pointer) — otherwise a test shows in its primary category but not the
    // others it's also a member of. See category/[slug]/page.tsx for the same pattern.
    ...(params.category ? { categories: { some: { category: { slug: params.category } } } } : {}),
  };

  const tests = await prisma.test.findMany({
    where,
    orderBy,
    take: limit + 1,
    ...(params.cursor
      ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 }
      : {}),
    include: {
      category: {
        select: { id: true, name: true, slug: true, colorBg: true, colorText: true },
      },
      codes: {
        select: { codeType: true, codeValue: true },
      },
      offerings: {
        // Also require the vendor itself to still be active/undeleted — an offering row can
        // outlive a vendor that was removed (e.g. Dirt Cheap Labs going out of business), and
        // without this a dead vendor's price kept counting toward minPrice/vendorCount.
        where: { isActive: true, deletedAt: null, currentPrice: { not: null }, vendor: { isActive: true, deletedAt: null } },
        select: { currentPrice: true },
        orderBy: { currentPrice: 'asc' },
      },
    },
  });

  const hasMore = tests.length > limit;
  const items = hasMore ? tests.slice(0, limit) : tests;

  const data: TestSummaryDTO[] = items.map((t) => ({
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    slug: t.slug,
    category: t.category,
    codes: t.codes.map((c) => ({ codeType: c.codeType, codeValue: c.codeValue })),
    minPrice: t.offerings[0]?.currentPrice?.toString() ?? null,
    vendorCount: t.offerings.length,
    isPopular: t.isPopular,
  }));

  return {
    data,
    nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]!.id) : null,
  };
}

export async function getTestBySlug(slug: string) {
  const test = await prisma.test.findFirst({
    where: { slug, deletedAt: null },
    include: {
      category: {
        select: { id: true, name: true, slug: true, colorBg: true, colorText: true },
      },
      codes: {
        select: { codeType: true, codeValue: true },
      },
      biomarkers: {
        include: {
          biomarker: {
            select: { id: true, name: true, slug: true, unit: true, description: true },
          },
        },
      },
      offerings: {
        // See the vendor filter note in getTests() above — same dead-vendor leak, worse here
        // since this is the actual test detail page.
        where: { isActive: true, deletedAt: null, vendor: { isActive: true, deletedAt: null } },
        include: {
          vendor: {
            select: { id: true, name: true, slug: true, websiteUrl: true, logoUrl: true },
          },
        },
        orderBy: { currentPrice: 'asc' },
      },
    },
  });

  return test;
}

export async function getPopularTests(limit = 6) {
  const tests = await prisma.test.findMany({
    where: { isPopular: true, deletedAt: null },
    take: limit,
    orderBy: { displayOrder: 'asc' },
    include: {
      category: {
        select: { id: true, name: true, slug: true, colorBg: true, colorText: true },
      },
      codes: {
        select: { codeType: true, codeValue: true },
      },
      offerings: {
        where: { isActive: true, deletedAt: null, currentPrice: { not: null }, vendor: { isActive: true, deletedAt: null } },
        select: { currentPrice: true },
        orderBy: { currentPrice: 'asc' },
      },
    },
  });

  const data: TestSummaryDTO[] = tests.map((t) => ({
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    slug: t.slug,
    category: t.category,
    codes: t.codes.map((c) => ({ codeType: c.codeType, codeValue: c.codeValue })),
    minPrice: t.offerings[0]?.currentPrice?.toString() ?? null,
    vendorCount: t.offerings.length,
    isPopular: t.isPopular,
  }));

  return data;
}
