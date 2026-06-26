import { notFound } from 'next/navigation';
import { prisma } from '@labprice/database';
import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import TestDetailClient from './TestDetailClient';

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

  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.97 0.01 280)' }}>
      <Navbar variant="light" />
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
