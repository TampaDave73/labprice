import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@labprice/database';
import { logAffiliateClick } from '@/lib/services/analytics-service';
import { buildOrderUrl } from '@/lib/affiliate-url';
import { getClientIp } from '@/lib/rate-limit';

// One-way hash for click attribution: lets us dedupe bot/self clicks later without storing raw
// IP/UA (PII). Salt keeps the digests from being reversible via a rainbow table of common IPs.
function hashValue(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const salt = process.env.ANALYTICS_HASH_SALT ?? 'labtestcompare-clicks';
  return createHash('sha256').update(salt).update(value).digest('hex').slice(0, 32);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offeringId: string }> },
) {
  try {
    const { offeringId } = await params;

    // findFirst (not findUnique) so we can also require the offering be live — never redirect to or
    // log a click for an inactive/soft-deleted listing.
    const offering = await prisma.offering.findFirst({
      where: { id: offeringId, isActive: true, deletedAt: null },
      include: {
        vendor: { select: { affiliateUrlTemplate: true, websiteUrl: true } },
      },
    });

    if (!offering) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Offering not found' } },
        { status: 404 },
      );
    }

    // Fire-and-forget click logging, with hashed IP/UA for later bot-dedupe. sessionId comes from the
    // `sid` cookie (middleware.ts) — this route is hit via a plain <a href> navigation, so there's no
    // client JS in the loop to attach an id to a fetch; the cookie rides along automatically.
    logAffiliateClick({
      offeringId,
      referrer: req.headers.get('referer') ?? undefined,
      ipHash: hashValue(getClientIp(req)),
      userAgentHash: hashValue(req.headers.get('user-agent')),
      sessionId: req.cookies.get('sid')?.value,
    });

    // Land on the exact product page we discovered, with affiliate tracking layered on if configured.
    const redirectUrl = buildOrderUrl(
      offering.externalUrl,
      offering.vendor.websiteUrl,
      offering.vendor.affiliateUrlTemplate,
    );

    if (!redirectUrl) {
      return NextResponse.json(
        { error: { code: 'NO_URL', message: 'No redirect URL available for this offering' } },
        { status: 404 },
      );
    }

    return NextResponse.redirect(redirectUrl, 302);
  } catch (err) {
    console.error('[GET /api/v1/go/[offeringId]]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
