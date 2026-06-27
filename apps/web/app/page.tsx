import { prisma } from '@labprice/database';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import SearchBar from './components/SearchBar';
import TestCard from './components/TestCard';
import HomeTestList from './components/HomeTestList';

const DEMO_CATEGORIES = [
  { name: 'Vitamins & Minerals', slug: 'vitamins-minerals' },
  { name: 'Hormones', slug: 'hormones' },
  { name: 'Metabolic', slug: 'metabolic' },
  { name: 'Blood Count', slug: 'blood-count' },
  { name: 'Cancer Markers', slug: 'cancer-markers' },
];

const DEMO_TESTS = [
  { id: '1', name: 'Vitamin D, 25-Hydroxy', shortName: 'Vitamin D', slug: 'vitamin-d-25-hydroxy', category: 'Vitamins & Minerals', categorySlug: 'vitamins-minerals', questCode: '17306', labcorpCode: '081950', minPrice: 28, vendorCount: 8 },
  { id: '2', name: 'Testosterone, Total', shortName: 'Testosterone', slug: 'testosterone-total', category: 'Hormones', categorySlug: 'hormones', questCode: '15983', labcorpCode: '004226', minPrice: 33, vendorCount: 7 },
  { id: '3', name: 'Thyroid Panel (TSH, T3, T4)', shortName: 'Thyroid Panel', slug: 'thyroid-panel', category: 'Hormones', categorySlug: 'hormones', questCode: '34429', labcorpCode: '028274', minPrice: 39, vendorCount: 6 },
  { id: '4', name: 'Complete Blood Count (CBC)', shortName: 'CBC', slug: 'complete-blood-count', category: 'Blood Count', categorySlug: 'blood-count', questCode: '6399', labcorpCode: '005009', minPrice: 22, vendorCount: 9 },
  { id: '5', name: 'Comprehensive Metabolic Panel', shortName: 'CMP', slug: 'comprehensive-metabolic-panel', category: 'Metabolic', categorySlug: 'metabolic', questCode: '10231', labcorpCode: '322000', minPrice: 24, vendorCount: 8 },
  { id: '6', name: 'Hemoglobin A1c', shortName: 'A1c', slug: 'hemoglobin-a1c', category: 'Metabolic', categorySlug: 'metabolic', questCode: '496', labcorpCode: '001453', minPrice: 25, vendorCount: 7 },
  { id: '7', name: 'Lipid Panel', shortName: 'Lipid Panel', slug: 'lipid-panel', category: 'Metabolic', categorySlug: 'metabolic', questCode: '7600', labcorpCode: '303756', minPrice: 19, vendorCount: 8 },
  { id: '8', name: 'Vitamin B12', shortName: 'Vitamin B12', slug: 'vitamin-b12', category: 'Vitamins & Minerals', categorySlug: 'vitamins-minerals', questCode: '927', labcorpCode: '081950', minPrice: 31, vendorCount: 6 },
  { id: '9', name: 'Iron and TIBC', shortName: 'Iron Panel', slug: 'iron-and-tibc', category: 'Vitamins & Minerals', categorySlug: 'vitamins-minerals', questCode: '7573', labcorpCode: '001321', minPrice: 26, vendorCount: 5 },
  { id: '10', name: 'PSA (Prostate-Specific Antigen)', shortName: 'PSA', slug: 'psa', category: 'Cancer Markers', categorySlug: 'cancer-markers', questCode: '11363', labcorpCode: '010322', minPrice: 35, vendorCount: 6 },
  { id: '11', name: 'Estradiol', shortName: 'Estradiol', slug: 'estradiol', category: 'Hormones', categorySlug: 'hormones', questCode: '4021', labcorpCode: '004515', minPrice: 38, vendorCount: 5 },
  { id: '12', name: 'Ferritin', shortName: 'Ferritin', slug: 'ferritin', category: 'Vitamins & Minerals', categorySlug: 'vitamins-minerals', questCode: '457', labcorpCode: '004598', minPrice: 27, vendorCount: 7 },
];

async function getHomeData() {
  try {
    const [categories, popularTests, allTests] = await Promise.all([
      prisma.category.findMany({ orderBy: { displayOrder: 'asc' } }),
      prisma.test.findMany({
        where: { isPopular: true, deletedAt: null },
        include: {
          category: true,
          offerings: {
            where: { isActive: true, deletedAt: null, currentPrice: { not: null } },
            select: { currentPrice: true },
          },
        },
        orderBy: { displayOrder: 'asc' },
        take: 6,
      }),
      prisma.test.findMany({
        where: { deletedAt: null },
        include: {
          category: true,
          offerings: {
            where: { isActive: true, deletedAt: null, currentPrice: { not: null } },
            select: { currentPrice: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const withMinPrice = (tests: typeof allTests) =>
      tests.map((t) => {
        const prices = t.offerings.map((o) => Number(o.currentPrice));
        return {
          id: t.id,
          name: t.name,
          shortName: t.shortName,
          slug: t.slug,
          category: t.category.name,
          categorySlug: t.category.slug,
          questCode: t.questCode,
          labcorpCode: t.labcorpCode,
          minPrice: prices.length > 0 ? Math.min(...prices) : null,
          vendorCount: t.offerings.length,
        };
      });

    return {
      categories: categories.map((c) => ({ name: c.name, slug: c.slug })),
      popularTests: withMinPrice(popularTests),
      allTests: withMinPrice(allTests),
      testCount: allTests.length,
    };
  } catch {
    return {
      categories: DEMO_CATEGORIES,
      popularTests: DEMO_TESTS.slice(0, 6),
      allTests: DEMO_TESTS,
      testCount: DEMO_TESTS.length,
    };
  }
}

export default async function Home() {
  const { categories, popularTests, allTests, testCount } = await getHomeData();

  return (
    <div style={{ minHeight: '100vh', background: 'oklch(0.97 0.01 280)' }}>
      <Navbar variant="dark" />

      {/* Hero */}
      <div
        style={{
          background: 'linear-gradient(155deg,oklch(0.17 0.1 280) 0%,oklch(0.21 0.12 295) 55%,oklch(0.19 0.09 265) 100%)',
          padding: '90px 24px 110px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 55% at 50% -5%, oklch(0.55 0.18 280 / 0.2), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 700, margin: '0 auto', animation: 'fadeUp 0.6s ease' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'oklch(0.95 0.06 280 / 0.12)',
              border: '1px solid oklch(0.8 0.1 280 / 0.22)',
              borderRadius: 20,
              padding: '5px 14px',
              marginBottom: 26,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.72 0.18 145)', flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: 'oklch(0.85 0.06 280)', fontWeight: 500 }}>
              Live prices from 10 ordering services
            </span>
          </div>
          <h1 style={{ fontSize: 54, fontWeight: 700, color: '#fff', lineHeight: 1.1, letterSpacing: '-1.8px', marginBottom: 18 }}>
            Compare blood test prices
            <br />
            <span
              style={{
                background: 'linear-gradient(90deg, #a855f7, #d946ef)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              instantly
            </span>
          </h1>
          <p style={{ fontSize: 18, color: 'oklch(0.7 0.05 280)', marginBottom: 44, lineHeight: 1.55 }}>
            Stop overpaying for lab tests. Search by test name or Quest/LabCorp test number.
          </p>

          <SearchBar />

          {/* Popular chips */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
            <span style={{ fontSize: 13, color: 'oklch(0.6 0.04 280)' }}>Popular:</span>
            {popularTests.map((t) => (
              <a
                key={t.slug}
                href={`/test/${t.slug}`}
                style={{
                  padding: '6px 15px',
                  background: 'oklch(0.95 0.06 280 / 0.12)',
                  border: '1px solid oklch(0.8 0.1 280 / 0.28)',
                  borderRadius: 20,
                  fontSize: 13,
                  color: 'oklch(0.85 0.07 280)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}
              >
                {t.shortName}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ background: 'oklch(0.22 0.1 280)', padding: '14px 24px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>10</span>
            <span style={{ fontSize: 13, color: 'oklch(0.72 0.06 280)' }}>Ordering Services</span>
          </div>
          <div style={{ width: 1, height: 28, background: 'oklch(0.4 0.08 280)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{testCount > 0 ? `${testCount}+` : '12+'}</span>
            <span style={{ fontSize: 13, color: 'oklch(0.72 0.06 280)' }}>Common Tests</span>
          </div>
          <div style={{ width: 1, height: 28, background: 'oklch(0.4 0.08 280)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'oklch(0.78 0.18 145)' }}>Up to 70%</span>
            <span style={{ fontSize: 13, color: 'oklch(0.72 0.06 280)' }}>Savings vs retail</span>
          </div>
          <div style={{ width: 1, height: 28, background: 'oklch(0.4 0.08 280)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>No</span>
            <span style={{ fontSize: 13, color: 'oklch(0.72 0.06 280)' }}>Insurance required</span>
          </div>
        </div>
      </div>

      {/* Browse section */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '56px 24px 80px' }}>
        {/* Popular Tests */}
        <div style={{ marginBottom: 52 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', color: 'oklch(0.18 0.04 280)', marginBottom: 18 }}>
            Popular Tests
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {popularTests.map((t) => (
              <TestCard
                key={t.slug}
                name={t.name}
                slug={t.slug}
                category={t.category}
                minPrice={t.minPrice}
              />
            ))}
          </div>
        </div>

        {/* All Tests — client component for filtering/sorting */}
        <HomeTestList tests={allTests} categories={categories} testCount={testCount} />
      </div>

      <Footer />
    </div>
  );
}
