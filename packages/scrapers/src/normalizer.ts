/**
 * Strip currency symbols, commas, whitespace and parse a price string to a number.
 * For ranges like "$49.99 - $89.99", takes the lower value.
 */
export function normalizePrice(raw: string): number {
  const cleaned = raw.trim();

  // Handle ranges: take the lower bound
  if (cleaned.includes('-') || cleaned.includes('–')) {
    const parts = cleaned.split(/[-–]/);
    const first = parts[0]?.trim();
    if (first) {
      const parsed = parseSinglePrice(first);
      if (!isNaN(parsed)) return parsed;
    }
  }

  return parseSinglePrice(cleaned);
}

function parseSinglePrice(s: string): number {
  // Remove $, commas, spaces, and other non-numeric chars except . and -
  const numeric = s.replace(/[^0-9.\-]/g, '');
  const value = parseFloat(numeric);

  if (isNaN(value)) {
    throw new Error(`Unable to parse price from: "${s}"`);
  }

  if (value < 0) {
    throw new Error(`Negative price detected: ${value}`);
  }

  return Math.round(value * 100) / 100;
}

export interface PriceChange {
  changed: boolean;
  percentChange: number;
  direction: 'up' | 'down' | 'same';
}

/**
 * Detect whether the price changed and by how much.
 */
export function detectChange(currentPrice: number, newPrice: number): PriceChange {
  if (currentPrice === newPrice) {
    return { changed: false, percentChange: 0, direction: 'same' };
  }

  const percentChange = currentPrice === 0
    ? 100
    : Math.round(((newPrice - currentPrice) / currentPrice) * 10000) / 100;

  return {
    changed: true,
    percentChange,
    direction: newPrice > currentPrice ? 'up' : 'down',
  };
}

export type ApprovalDecision = 'auto_approve' | 'manual_review' | 'auto_reject';

/**
 * Determine whether a price change should be auto-approved, flagged, or rejected.
 *
 * BR-6: Auto-approve if change < 5% AND vendor accuracy > 95%
 * BR-8: Flag for manual review if change > 20%
 * BR-9: Auto-reject if price is zero or negative
 */
export function shouldAutoApprove(
  percentChange: number,
  vendorAccuracy: number,
  newPrice?: number,
): ApprovalDecision {
  // BR-9: Auto-reject if price is zero or negative
  if (newPrice !== undefined && newPrice <= 0) {
    return 'auto_reject';
  }

  const absChange = Math.abs(percentChange);

  // BR-8: Flag for manual review if change > 20%
  if (absChange > 20) {
    return 'manual_review';
  }

  // BR-6: Auto-approve if change < 5% AND vendor accuracy > 95%
  if (absChange < 5 && vendorAccuracy > 95) {
    return 'auto_approve';
  }

  return 'manual_review';
}
