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
    <div className="min-h-screen" style={{ background: 'oklch(0.97 0.01 280)' }}>
      <Navbar variant="dark" />

      {/* Hero */}
      <div
        className="px-6 text-center relative overflow-hidden"
        style={{
          background: 'linear-gradient(155deg,oklch(0.17 0.1 280) 0%,oklch(0.21 0.12 295) 55%,oklch(0.19 0.09 265) 100%)',
          padding: '90px 24px 110px',
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-5%,oklch(0.55_0.18_280/0.2),transparent)] pointer-events-none" />
        <div className="relative max-w-[700px] mx-auto animate-[fadeUp_0.6s_ease]">
          <div
            className="inline-flex items-center"
            style={{
              gap: 8,
              background: 'oklch(0.95 0.06 280 / 0.12)',
              border: '1px solid oklch(0.8 0.1 280 / 0.22)',
              borderRadius: 20,
              padding: '5px 14px',
              marginBottom: 24,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.72 0.18 145)', display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: 'oklch(0.85 0.06 280)', fontWeight: 500 }}>
              Live prices from 10 ordering services
            </span>
          </div>
          <h1 className="text-[54px] font-bold text-white leading-[1.1] tracking-[-1.8px] mb-[18px]">
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
          <p className="text-lg text-[oklch(0.7_0.05_280)] mb-11 leading-relaxed">
            Stop overpaying for lab tests. Search by test name or Quest/LabCorp test number.
          </p>

          <SearchBar />

          {/* Popular chips */}
          <div className="flex items-center justify-center flex-wrap gap-2 mt-[22px]">
            <span className="text-[13px] text-[oklch(0.6_0.04_280)]">Popular:</span>
            {popularTests.map((t) => (
              <a
                key={t.slug}
                href={`/test/${t.slug}`}
                className="no-underline"
                style={{
                  padding: '6px 15px',
                  background: 'oklch(0.95 0.06 280 / 0.12)',
                  border: '1px solid oklch(0.8 0.1 280 / 0.28)',
                  borderRadius: 20,
                  fontSize: 13,
                  color: 'oklch(0.85 0.07 280)',
                  fontWeight: 500,
                  transition: 'background 150ms',
                }}
              >
                {t.shortName}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-6 py-3.5" style={{ background: 'oklch(0.22 0.1 280)' }}>
        <div className="max-w-[1240px] mx-auto flex items-center justify-center gap-12 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="text-[22px] font-bold text-white">10</span>
            <span className="text-[13px] text-[oklch(0.72_0.06_280)]">Ordering Services</span>
          </div>
          <div className="w-px h-7 bg-[oklch(0.4_0.08_280)]" />
          <div className="flex items-center gap-2.5">
            <span className="text-[22px] font-bold text-white">{testCount > 0 ? `${testCount}+` : '12+'}</span>
            <span className="text-[13px] text-[oklch(0.72_0.06_280)]">Common Tests</span>
          </div>
          <div className="w-px h-7 bg-[oklch(0.4_0.08_280)]" />
          <div className="flex items-center gap-2.5">
            <span className="text-[22px] font-bold text-[oklch(0.78_0.18_145)]">Up to 70%</span>
            <span className="text-[13px] text-[oklch(0.72_0.06_280)]">Savings vs retail</span>
          </div>
          <div className="w-px h-7 bg-[oklch(0.4_0.08_280)]" />
          <div className="flex items-center gap-2.5">
            <span className="text-[22px] font-bold text-white">No</span>
            <span className="text-[13px] text-[oklch(0.72_0.06_280)]">Insurance required</span>
          </div>
        </div>
      </div>

      {/* Browse section */}
      <div className="max-w-[1240px] mx-auto px-6 py-14 pb-20">
        {/* Popular Tests */}
        <div className="mb-[52px]">
          <h2 className="text-2xl font-bold tracking-[-0.4px] text-[oklch(0.18_0.04_280)] mb-[18px]">
            Popular Tests
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
