import { notFound } from 'next/navigation';
import { prisma } from '@labprice/database';
import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import TestCard from '../../components/TestCard';
import PageViewTracker from '../../components/PageViewTracker';

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
  const description = `Compare prices for ${category.name} blood tests across ordering services. Find the cheapest ${category.name.toLowerCase()} lab tests.`;
  return {
    title: `${category.name} Tests — Compare Prices`,
    description,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: {
      title: `${category.name} Tests — Compare Prices | LabTestCompare`,
      description,
      url: `/category/${category.slug}`,
      type: 'website',
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

  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.985 0.005 260)' }}>
      <PageViewTracker />
      <Navbar />
      <main className="max-w-[1240px] mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-[13px] text-[oklch(0.5_0.04_260)] mb-6">
          <Link href="/" className="hover:text-[oklch(0.35_0.04_260)] no-underline text-inherit">
            Home
          </Link>
          <span>/</span>
          <span className="text-[oklch(0.3_0.04_260)] font-medium">{category.name}</span>
        </nav>

        {/* Header */}
        <h1 className="text-[32px] font-bold text-[oklch(0.18_0.04_260)] tracking-[-0.5px] mb-2">
          {category.name}
        </h1>
        <p className="text-[oklch(0.5_0.04_260)] mb-8">
          Compare prices for {tests.length} {category.name.toLowerCase()} test{tests.length !== 1 ? 's' : ''} across ordering services.
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
      </main>
      <Footer />
    </div>
  );
}
