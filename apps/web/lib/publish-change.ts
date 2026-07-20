// Publish an approved staged price change to the live offering — inline, in a single transaction.
//
// WHY inline (not enqueued to the worker): the admin Change Queue must work with just the web app
// running. Publishing is a small DB write, so enqueuing it to BullMQ only added a hard dependency on
// the worker + Redis (and could hang the approve request if Redis stalled). This does it directly.
import { prisma } from '@labprice/database';

/**
 * Apply a staged change: bump the offering's price, record price history, stamp the review, and store
 * the discovered product URL (so the "Order"/verify link points at the exact page). Idempotent-ish:
 * only publishes changes that are APPROVED/AUTO_APPROVED. Returns true if it published.
 */
export async function publishStagedChange(stagedChangeId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const staged = await tx.stagedPriceChange.findUnique({
      where: { id: stagedChangeId },
      include: { offering: { select: { externalUrl: true } } },
    });
    if (!staged || (staged.status !== 'APPROVED' && staged.status !== 'AUTO_APPROVED')) return false;

    // A discovered source URL is passed through the reviewNote (`… @ <url>`); if present and the
    // offering has no URL yet, adopt it so the affiliate/verify link resolves to the exact page.
    const urlMatch = staged.reviewNote?.match(/@ (https?:\/\/\S+)/);
    const discoveredUrl = urlMatch?.[1];

    await tx.offering.update({
      where: { id: staged.offeringId },
      data: {
        previousPrice: staged.oldPrice,
        currentPrice: staged.newPrice,
        priceUpdatedAt: new Date(),
        lastCheckedAt: new Date(),
        ...(discoveredUrl && !staged.offering.externalUrl ? { externalUrl: discoveredUrl } : {}),
      },
    });

    await tx.priceHistory.create({
      data: {
        offeringId: staged.offeringId,
        oldPrice: staged.oldPrice,
        newPrice: staged.newPrice,
        observedAt: staged.scrapedAt,
        source: 'SCRAPE',
        scrapeRunId: staged.scrapeRunId,
      },
    });

    await tx.stagedPriceChange.update({ where: { id: stagedChangeId }, data: { reviewedAt: new Date() } });
    return true;
  });
}
