import { prisma } from '@labprice/database';

interface PublishResult {
  success: boolean;
  offeringId: string;
  oldPrice: number | null;
  newPrice: number;
}

/**
 * Atomically publish a staged price change:
 * 1. Update offerings.current_price
 * 2. Insert price_history row
 * 3. Insert audit_logs entry
 */
export async function publishPriceChange(stagedChangeId: string): Promise<PublishResult> {
  return prisma.$transaction(async (tx) => {
    // Fetch the staged change
    const staged = await tx.staged_price_changes.findUniqueOrThrow({
      where: { id: stagedChangeId },
    });

    // Get the current offering
    const offering = await tx.offerings.findUniqueOrThrow({
      where: { id: staged.offering_id },
    });

    const oldPrice = offering.current_price?.toNumber() ?? null;
    const newPrice = staged.new_price.toNumber();

    // 1. Update current price on offering
    await tx.offerings.update({
      where: { id: staged.offering_id },
      data: { current_price: newPrice },
    });

    // 2. Insert price_history row
    await tx.price_history.create({
      data: {
        offering_id: staged.offering_id,
        price: newPrice,
        source: 'scraper',
        scraped_at: staged.scraped_at ?? new Date(),
      },
    });

    // 3. Insert audit_logs entry
    await tx.audit_logs.create({
      data: {
        entity_type: 'offering',
        entity_id: staged.offering_id,
        action: 'price_published',
        old_value: oldPrice !== null ? JSON.stringify({ price: oldPrice }) : null,
        new_value: JSON.stringify({ price: newPrice }),
        performed_by: 'system:scraper',
      },
    });

    // Mark staged change as published
    await tx.staged_price_changes.update({
      where: { id: stagedChangeId },
      data: { status: 'PUBLISHED', reviewed_at: new Date() },
    });

    return {
      success: true,
      offeringId: staged.offering_id,
      oldPrice,
      newPrice,
    };
  });
}
