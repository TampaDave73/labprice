import { prisma, type Prisma } from '@labprice/database';
import type { OfferingDTO, MoneyString } from '@labprice/shared';

type Decimal = Prisma.Decimal;

export async function getOfferingsByTest(testId: string) {
  const offerings = await prisma.offering.findMany({
    where: { testId, isActive: true, deletedAt: null },
    include: {
      vendor: {
        select: { id: true, name: true, slug: true, websiteUrl: true, logoUrl: true },
      },
    },
    orderBy: { currentPrice: 'asc' },
  });

  const cheapestPrice = offerings.find((o) => o.currentPrice !== null)?.currentPrice;

  const data: OfferingDTO[] = offerings.map((o) => ({
    id: o.id,
    testId: o.testId,
    vendor: o.vendor,
    currentPrice: o.currentPrice?.toString() ?? null,
    previousPrice: o.previousPrice?.toString() ?? null,
    priceUpdatedAt: o.priceUpdatedAt?.toISOString() ?? null,
    externalUrl: o.externalUrl,
    isActive: o.isActive,
    isCheapest: !!(
      cheapestPrice &&
      o.currentPrice &&
      o.currentPrice.equals(cheapestPrice)
    ),
  }));

  return data;
}

export function computeBestPrice(
  offerings: { currentPrice: Decimal | null }[],
): { bestPrice: MoneyString | null; medianPrice: MoneyString | null; savingsPercent: number | null } {
  const prices = offerings
    .map((o) => o.currentPrice)
    .filter((p): p is Decimal => p !== null)
    .map((p) => parseFloat(p.toString()))
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return { bestPrice: null, medianPrice: null, savingsPercent: null };
  }

  const best = prices[0]!;
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[mid - 1]! + prices[mid]!) / 2
      : prices[mid]!;

  const highest = prices[prices.length - 1]!;
  const savingsPercent =
    prices.length > 1
      ? Math.round(((highest - best) / highest) * 100)
      : null;

  return {
    bestPrice: best.toFixed(2),
    medianPrice: median.toFixed(2),
    savingsPercent,
  };
}
