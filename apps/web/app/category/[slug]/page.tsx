import { notFound } from 'next/navigation';
import { prisma } from '@labprice/database';
import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import TestCard from '../../components/TestCard';
import PageViewTracker from '../../components/PageViewTracker';
import GuideLinks from '../../components/GuideLinks';
import PageProvenance from '../../components/PageProvenance';
import { guidesForTests } from '@/lib/guides';
import { OG_IMAGE } from '@/lib/og';

interface Props {
  params: Promise<{ slug: string }>;
}

async function getCategory(slug: string) {
  // List tests via the many-to-many membership so a test shows under every category it's in.
  const category = await prisma.category.findUnique({
    where: { slug },
    include: {
      testCategories: {
        where: { test: { deletedAt: null } },
        include: {
          test: {
            include: {
              offerings: {
                // vendor filter: excludes offerings left behind by a removed vendor (offering
                // status doesn't auto-follow vendor status).
                where: { isActive: true, deletedAt: null, currentPrice: { not: null }, vendor: { isActive: true, deletedAt: null } },
                select: { currentPrice: true },
              },
            },
          },
        },
      },
    },
  });
  return category;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) return { title: 'Category Not Found' };
  // 120–160 characters, with the count in it so the slot says something a competitor's page doesn't.
  const count = category.testCategories.length;
  const description =
    `Compare self-pay prices for ${count} ${category.name.toLowerCase()} blood test${count === 1 ? '' : 's'} across every ordering service we track. Same Quest or LabCorp test, no insurance needed.`.slice(0, 160);
  return {
    title: `${category.name} Tests — Compare Prices`,
    description,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: {
      title: `${category.name} Tests — Compare Prices | LabTestCompare`,
      description,
      url: `/category/${category.slug}`,
      type: 'website',
      images: [OG_IMAGE],
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();

  const tests = category.testCategories
    .map((tc) => tc.test)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => {
      const prices = t.offerings.map((o) => Number(o.currentPrice));
      return {
        name: t.name,
        slug: t.slug,
        category: category.name,
        minPrice: prices.length > 0 ? Math.min(...prices) : null,
      };
    });

  const guides = await guidesForTests(tests.map((t) => t.slug));

  const priced = tests.filter((t) => t.minPrice != null);
  const cheapest = priced.length > 0 ? priced.reduce((a, b) => (a.minPrice! <= b.minPrice! ? a : b)) : null;
  const priciest = priced.length > 0 ? priced.reduce((a, b) => (a.minPrice! >= b.minPrice! ? a : b)) : null;

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';
  const pageUrl = `${base}/category/${category.slug}`;

  // CollectionPage + ItemList says, in one place, what this page is a list OF — without it a
  // category page is just a grid of links with no stated subject. BreadcrumbList mirrors the visible
  // breadcrumb; a visual-only breadcrumb is invisible to search.
  const nodes = [
    {
      '@type': 'CollectionPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: `${category.name} Tests — Compare Prices`,
      isPartOf: { '@id': `${base}/#website` },
      publisher: { '@id': `${base}/#organization` },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: tests.length,
        itemListElement: tests.map((t, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: t.name,
          url: `${base}/test/${t.slug}`,
        })),
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: base },
        { '@type': 'ListItem', position: 2, name: category.name },
      ],
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.985 0.005 260)' }}>
      {/* One typed script per node — a `@graph` wrapper has no top-level @type and validators
          report it as a schema missing its type. The double backslash in the escape is load-bearing:
          '<' in TypeScript source IS the character "<", making the replace a silent no-op. */}
      {nodes.map((node) => (
        <script
          key={node['@type'] as string}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', ...node }).replace(/</g, '\\u003c') }}
        />
      ))}
      <PageViewTracker />
      <Navbar />
      <main id="main" className="max-w-[1240px] mx-auto px-6 py-10">
        {/* Breadcrumb. aria-label matters: it's what makes this a named landmark rather than an
            anonymous <nav>, and it pairs with the BreadcrumbList node above. */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-[oklch(0.5_0.04_260)] mb-6">
          <Link href="/" className="hover:text-[oklch(0.35_0.04_260)] no-underline text-inherit">
            Home
          </Link>
          <span>/</span>
          <span className="text-[oklch(0.3_0.04_260)] font-medium">{category.name}</span>
        </nav>

        {/* Header. The H1 is not the title tag ("… Tests — Compare Prices"), and the paragraph under
            it answers the page's own question with real numbers rather than restating the heading —
            this is the block an answer engine quotes, and the reason these pages previously scored
            worst on the site for citability. */}
        <h1 className="text-[32px] font-bold text-[oklch(0.18_0.04_260)] tracking-[-0.5px] mb-2">
          {category.name} blood tests
        </h1>
        <p className="text-[oklch(0.42_0.04_260)] mb-8 max-w-[820px] leading-relaxed">
          LabTestCompare tracks self-pay prices for {tests.length} {category.name.toLowerCase()} test
          {tests.length !== 1 ? 's' : ''} across the ordering services we cover.
          {cheapest?.minPrice != null && priciest?.minPrice != null && (
            <>
              {' '}
              The cheapest starts at ${cheapest.minPrice.toFixed(2)} ({cheapest.name}) and the most
              expensive at ${priciest.minPrice.toFixed(2)} ({priciest.name}).
            </>
          )}{' '}
          Every price is for the same Quest Diagnostics or LabCorp lab test — no insurance required,
          and the blood draw happens at a patient service center near you.
        </p>

        {/* Test grid */}
        {tests.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {tests.map((t) => (
              <TestCard
                key={t.slug}
                name={t.name}
                slug={t.slug}
                category={t.category}
                minPrice={t.minPrice}
              />
            ))}
          </div>
        ) : (
          <p className="text-[oklch(0.5_0.04_260)] text-center py-12">
            No tests available in this category yet.
          </p>
        )}
        <GuideLinks guides={guides} heading={`Guides for ${category.name.toLowerCase()} testing`} />
        <PageProvenance flush />
      </main>
      <Footer />
    </div>
  );
}
