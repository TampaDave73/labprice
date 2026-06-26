import { NextRequest, NextResponse } from 'next/server';
import { getTestBySlug } from '@/lib/services/test-service';
import { getOfferingsByTest, computeBestPrice } from '@/lib/services/offering-service';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const test = await getTestBySlug(slug);

    if (!test) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Test "${slug}" not found` } },
        { status: 404 },
      );
    }

    const offerings = await getOfferingsByTest(test.id);
    const priceStats = computeBestPrice(
      test.offerings.map((o) => ({ currentPrice: o.currentPrice })),
    );

    const data = {
      id: test.id,
      name: test.name,
      shortName: test.shortName,
      slug: test.slug,
      description: test.description,
      purpose: test.purpose,
      procedure: test.procedure,
      preparation: test.preparation,
      normalRange: test.normalRange,
      category: test.category,
      codes: test.codes.map((c) => ({ codeType: c.codeType, codeValue: c.codeValue })),
      biomarkers: test.biomarkers.map((tb) => tb.biomarker),
      offerings,
      bestPrice: priceStats.bestPrice,
      medianPrice: priceStats.medianPrice,
      savingsPercent: priceStats.savingsPercent,
    };

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[GET /api/v1/tests/[slug]]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
