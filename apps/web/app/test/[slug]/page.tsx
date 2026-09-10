import { notFound } from 'next/navigation';
import { prisma } from '@labprice/database';
import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import PageViewTracker from '../../components/PageViewTracker';
import TestDetailClient from './TestDetailClient';
import GuideLinks from '../../components/GuideLinks';
import PageProvenance from '../../components/PageProvenance';
import TestFaq from '../../components/TestFaq';
import { testFaq } from '@/lib/test-faq';
import { testPhrase } from '@/lib/grammar';
import { guidesForTest } from '@/lib/guides';
import { OG_IMAGE } from '@/lib/og';

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
  // 120–160 characters. The old one-liner came out at 65 — half the space a result gives you, and
  // audited as "meta description is short". The range and the lab names are the parts a searcher is
  // actually deciding on, so they go in rather than filler.
  const prices = test.offerings.map((o) => Number(o.currentPrice));
  const description =
    prices.length > 0
      ? `Compare ${test.name} prices across ${prices.length} self-pay ordering services — $${Math.min(...prices).toFixed(2)} to $${Math.max(...prices).toFixed(2)}. Same Quest or LabCorp test, no insurance needed.`.slice(0, 160)
      : `What a ${test.name} test measures, how the blood draw works, how to prepare, and where to order it self-pay without insurance — drawn at Quest or LabCorp.`.slice(0, 160);
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
      images: [OG_IMAGE],
    },
  };
}

export default async function TestDetailPage({ params }: Props) {
  const { slug } = await params;
  const test = await getTest(slug);
  if (!test) notFound();

  // Articles link heavily into these pages; this is the link back. Reads Post.relatedTests, so the
  // graph is maintained in one place (set a post's related tests and both directions follow).
  const guides = await guidesForTest(slug);

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

  // Freshest price verification across all vendors — the page's real "last updated", and the only
  // date on it that means anything. `test.updatedAt` moves when a typo is fixed; this moves when the
  // facts a reader came for changed.
  const lastChecked = offerings
    .map((o) => o.checkedAt)
    .filter((d): d is string => d != null)
    .sort()
    .at(-1) ?? null;

  // The FAQ, built once. This same array renders visibly (<TestFaq/>) and becomes the FAQPage node
  // below — never assemble them separately, see lib/test-faq.ts.
  const phrase = testPhrase(test.name);
  const faq = testFaq({
    name: test.name,
    phrase,
    questCode,
    labcorpCode,
    confidence: test.confidence,
    thirdPartyOnly: test.thirdPartyOnly,
    offerings: offerings.map((o) => ({ vendorName: o.vendorName, price: o.price })),
    lastChecked,
  });

  // Five nodes, deliberately split:
  //  - MedicalTest carries the clinical facts. It does NOT carry `offers` — schema.org defines that
  //    on Product/Service, not on MedicalTest (the old single-node markup hung an AggregateOffer off
  //    MedicalTest, and set `bodyLocation` to the category name, which expects an anatomical site).
  //  - Product carries the prices, with one Offer per vendor so the vendor↔price pairing is
  //    machine-readable instead of only being visible in the rendered table.
  //  - BreadcrumbList mirrors the breadcrumb the page already renders.
  // Each node is emitted as its own script tag rather than inside one `@graph`: a @graph wrapper
  // has no top-level `@type` and validators report it as a schema missing its type. `@id`
  // cross-references resolve across separate tags, so the links between the nodes still hold.
  const nodes = [
      // WebPage carries the things audits look for on a YMYL page and that a Product/MedicalTest node
      // has nowhere to put: who stands behind the page, and when its facts were last verified.
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: `${test.name} — Compare Prices`,
        isPartOf: { '@id': `${base}/#website` },
        about: { '@id': `${pageUrl}#test` },
        publisher: { '@id': `${base}/#organization` },
        author: { '@id': `${base}/#organization` },
        ...(lastChecked && { dateModified: lastChecked }),
        // Every page here is health-adjacent; saying so is what the disclaimer link is for.
        isAccessibleForFree: true,
      },
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
              // Product without an image is a rich-result warning even when the product is a lab
              // test with nothing to photograph. The generated OG card is a truthful stand-in.
              image: `${base}/opengraph-image.png`,
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
    // Emitted from the SAME array <TestFaq/> renders, and only when it rendered something.
    // Structured data describing questions a visitor can't see is what gets rich results revoked.
    ...(faq.length > 0
      ? [
          {
            '@type': 'FAQPage',
            '@id': `${pageUrl}#faq`,
            mainEntity: faq.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: { '@type': 'Answer', text: item.answer },
            })),
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.985 0.005 260)' }}>
      {/* JSON.stringify doesn't escape "<" — a test name/description containing "</script>" could
          otherwise break out of this tag. < is valid inside a JSON string and parses identically. */}
      {nodes.map((node) => (
        <script
          key={node['@type'] as string}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', ...node }).replace(/</g, '\\u003c') }}
        />
      ))}
      <PageViewTracker testId={test.id} />
      <Navbar />
      <main id="main">
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
        <GuideLinks
          guides={guides}
          heading={`Guides about ${test.name}`}
          intro="Plain-English explanations of what this test measures and how it's done."
          maxWidth={1240}
        />
        <TestFaq items={faq} heading={`${test.name}: common questions`} />
        <PageProvenance updated={lastChecked} />
      </main>
      <Footer />
    </div>
  );
}
