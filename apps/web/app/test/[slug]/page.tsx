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
  const description = `Compare ${test.name} prices from ${test.offerings.length} ordering services.${minPrice ? ` From $${minPrice.toFixed(2)}.` : ''}`;
  return {
    title: `${test.name} — Compare Prices`,
    description,
    // Relative — resolved against metadataBase in the root layout. Without it, ?utm_*/?ref variants
    // of a test page each index separately and split the page's own ranking signals.
    alternates: { canonical: `/test/${test.slug}` },
    openGraph: {
      title: `${test.name} — Compare Prices | LabTestCompare`,
      description,
      url: `/test/${test.slug}`,
      type: 'website',
    },
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
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';
  const pageUrl = `${base}/test/${test.slug}`;

  // Three nodes, deliberately split:
  //  - MedicalTest carries the clinical facts. It does NOT carry `offers` — schema.org defines that
  //    on Product/Service, not on MedicalTest (the old single-node markup hung an AggregateOffer off
  //    MedicalTest, and set `bodyLocation` to the category name, which expects an anatomical site).
  //  - Product carries the prices, with one Offer per vendor so the vendor↔price pairing is
  //    machine-readable instead of only being visible in the rendered table.
  //  - BreadcrumbList mirrors the breadcrumb the page already renders.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'MedicalTest',
        '@id': `${pageUrl}#test`,
        name: test.name,
        description: test.description,
        url: pageUrl,
        ...(test.normalRange && { normalRange: test.normalRange }),
      },
      ...(offerings.length > 0
        ? [
            {
              '@type': 'Product',
              '@id': `${pageUrl}#product`,
              name: `${test.name} blood test`,
              description: test.description,
              url: pageUrl,
              ...(test.category && { category: test.category.name }),
              isRelatedTo: { '@id': `${pageUrl}#test` },
              offers: {
                '@type': 'AggregateOffer',
                priceCurrency: 'USD',
                lowPrice: Math.min(...prices).toFixed(2),
                highPrice: Math.max(...prices).toFixed(2),
                offerCount: offerings.length,
                offers: offerings.map((o) => ({
                  '@type': 'Offer',
                  price: o.price.toFixed(2),
                  priceCurrency: 'USD',
                  availability: 'https://schema.org/InStock',
                  // The tracked redirect, not the raw vendor URL — same link the Order button uses.
                  url: `${base}/api/v1/go/${o.id}`,
                  seller: { '@type': 'Organization', name: o.vendorName },
                })),
              },
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: base },
          { '@type': 'ListItem', position: 2, name: test.category.name, item: `${base}/category/${test.category.slug}` },
          { '@type': 'ListItem', position: 3, name: test.name },
        ],
      },
    ],
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
