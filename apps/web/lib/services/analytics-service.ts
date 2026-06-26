import { prisma } from '@labprice/database';

export function logPageView(params: {
  path: string;
  testId?: string;
  userId?: string;
  sessionId?: string;
}) {
  // Fire-and-forget
  prisma.pageView
    .create({ data: params })
    .catch((err) => console.error('[analytics] pageView insert failed:', err));
}

export function logSearch(params: {
  query: string;
  resultsCount: number;
  userId?: string;
  sessionId?: string;
}) {
  prisma.searchLog
    .create({ data: params })
    .catch((err) => console.error('[analytics] searchLog insert failed:', err));
}

export function logAffiliateClick(params: {
  offeringId: string;
  userId?: string;
  sessionId?: string;
  ipHash?: string;
  userAgentHash?: string;
  referrer?: string;
}) {
  prisma.affiliateClick
    .create({ data: params })
    .catch((err) => console.error('[analytics] affiliateClick insert failed:', err));
}
