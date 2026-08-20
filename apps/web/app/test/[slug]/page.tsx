import { notFound } from 'next/navigation';
import { prisma } from '@labprice/database';
import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import PageViewTracker from '../../components/PageViewTracker';
import TestDetailClient from './TestDetailClient';

interface Props {
  params: Promise<{ slug: string }>;
}

// No `auth()` here on purpose: the test page is fully public (no per-user UI), so it stays
// statically renderable / ISR-cacheable instead of being forced dynamic by a session lookup.
async function getTest(slug: string) {
  const test = await prisma.test.findUnique({
    where: { slug },
    include: {
      category: true,
      codes: true,
      offerings: {
        // vendor filter: offering.isActive/deletedAt don't auto-follow the vendor being
        // deactivated/deleted (e.g. Dirt Cheap Labs going out of business) — without this a
        // removed vendor keeps showing here.
        where: { isActive: true, deletedAt: null, currentPrice: { not: null }, vendor: { isActive: true, deletedAt: null } },
        include: { vendor: true },
        orderBy: { currentPrice: 'asc' },
      },
    },
  });
  if (!test || test.deletedAt) return null;
  return test;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const test = await getTest(slug);
  if (!test) return { title: 'Test Not Found' };
  const minPrice = test.offerings.length > 0 ? Math.min(...test.offerings.map((o) => Number(o.currentPrice))) : null;
  return {
    title: `${test.name} — Compare Prices`,
    description: `Compare ${test.name} prices from ${test.offerings.length} ordering services.${minPrice ? ` From $${minPrice.toFixed(2)}.` : ''}`,
  };
}

export default async function TestDetailPage({ params }: Props) {
  const { slug } = await params;
  const test = await getTest(slug);
  if (!test) notFound();

  const offerings = test.offerings.map((o) => ({
    id: o.id,
    vendorName: o.vendor.name,
    vendorSlug: o.vendor.slug,
    price: Number(o.currentPrice),
    memberPrice: o.memberPrice != null ? Number(o.memberPrice) : null,
    membershipNote: o.vendor.membershipNote ?? null,
    // Dual-lab vendors (Dirt Cheap Labs): the other lab's price when it also carries this test, so
    // it's shown as a secondary option instead of silently discarded (price above stays the cheaper).
    altLabPrice: o.altLabPrice != null ? Number(o.altLabPrice) : null,
    altLabProvider: o.altLabProvider,
    externalUrl: o.externalUrl,
    // "checked N ago" prefers lastCheckedAt (stamped on every scrape verification, even when the
    // price is unchanged); priceUpdatedAt only moves on a change, which read as false staleness.
    checkedAt: (o.lastCheckedAt ?? o.priceUpdatedAt)?.toISOString() ?? null,
  }));

  const questCode = test.questCode ?? test.codes.find((c) => c.codeType === 'QUEST')?.codeValue ?? null;
  const labcorpCode = test.labcorpCode ?? test.codes.find((c) => c.codeType === 'LABCORP')?.codeValue ?? null;

  const prices = offerings.map((o) => o.price);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalTest',
    name: test.name,
    description: test.description,
    url: `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com'}/test/${test.slug}`,
    ...(test.category && { bodyLocation: test.category.name }),
    ...(offerings.length > 0 && {
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: Math.min(...prices).toFixed(2),
        highPrice: Math.max(...prices).toFixed(2),
        priceCurrency: 'USD',
        offerCount: offerings.length,
      },
    }),
  };

  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.985 0.005 260)' }}>
      <script
        type="application/ld+json"
        // JSON.stringify doesn't escape "<" — a test name/description containing "</script>" could
        // otherwise break out of this tag. < is valid inside a JSON string and parses identically.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <PageViewTracker testId={test.id} />
      <Navbar />
      <TestDetailClient
        test={{
          id: test.id,
          name: test.name,
          slug: test.slug,
          category: test.category.name,
          categorySlug: test.category.slug,
          description: test.description,
          purpose: test.purpose,
          procedure: test.procedure,
          preparation: test.preparation,
          normalRange: test.normalRange,
          questCode,
          labcorpCode,
          thirdPartyOnly: test.thirdPartyOnly,
          confidence: test.confidence,
          notes: test.notes,
          cardioIq: test.cardioIq,
          labVariant: test.labVariant,
        }}
        offerings={offerings}
      />
      <Footer />
    </div>
  );
}
