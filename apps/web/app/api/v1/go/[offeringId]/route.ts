import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@labprice/database';
import { logAffiliateClick } from '@/lib/services/analytics-service';
import { buildOrderUrl } from '@/lib/affiliate-url';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offeringId: string }> },
) {
  try {
    const { offeringId } = await params;

    const offering = await prisma.offering.findUnique({
      where: { id: offeringId },
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

    // Fire-and-forget click logging
    logAffiliateClick({
      offeringId,
      referrer: req.headers.get('referer') ?? undefined,
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
