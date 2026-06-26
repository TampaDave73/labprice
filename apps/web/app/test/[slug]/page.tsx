import { notFound } from 'next/navigation';
import { prisma } from '@labprice/database';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import TestDetailClient from './TestDetailClient';
import SaveTestButton from './SaveTestButton';
import PriceAlertButton from './PriceAlertButton';

interface Props {
  params: Promise<{ slug: string }>;
}

async function getTest(slug: string) {
  const test = await prisma.test.findUnique({
    where: { slug },
    include: {
      category: true,
      codes: true,
      biomarkers: { include: { biomarker: true } },
      offerings: {
        where: { isActive: true, deletedAt: null, currentPrice: { not: null } },
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

  const session = await auth();
  let savedTestId: string | null = null;
  if (session?.user) {
    const saved = await prisma.savedTest.findUnique({
      where: { userId_testId: { userId: session.user.id, testId: test.id } },
      select: { id: true },
    });
    savedTestId = saved?.id ?? null;
  }

  const offerings = test.offerings.map((o) => ({
    id: o.id,
    vendorName: o.vendor.name,
    vendorSlug: o.vendor.slug,
    price: Number(o.currentPrice),
    externalUrl: o.externalUrl,
  }));

  const questCode = test.questCode ?? test.codes.find((c) => c.codeType === 'QUEST')?.codeValue ?? null;
  const labcorpCode = test.labcorpCode ?? test.codes.find((c) => c.codeType === 'LABCORP')?.codeValue ?? null;

  const biomarkers = test.biomarkers.map((tb) => ({
    name: tb.biomarker.name,
    unit: tb.biomarker.unit,
    description: tb.biomarker.description,
  }));

  const prices = offerings.map((o) => o.price);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalTest',
    name: test.name,
    description: test.description,
    url: `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labprice.com'}/test/${test.slug}`,
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
    <div className="min-h-screen" style={{ background: 'oklch(0.97 0.01 280)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar variant="light" />
      {session?.user && (
        <div className="max-w-[1240px] mx-auto px-6 pt-4 flex items-center gap-2 justify-end">
          <SaveTestButton testId={test.id} initialSavedId={savedTestId} />
          <PriceAlertButton testId={test.id} />
        </div>
      )}
      <TestDetailClient
        test={{
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
        }}
        offerings={offerings}
        biomarkers={biomarkers}
      />
      <Footer />
    </div>
  );
}
