// Public homepage (Server Component). Loads categories, popular + all tests (each with its full
// category set and min price) and the active-vendor count for the live stats. Falls back to DEMO_*
// data if the DB is unavailable. `revalidate = 60` keeps counts/prices fresh in production.
import { prisma } from '@labprice/database';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import SearchBar from './components/SearchBar';
import TestCard from './components/TestCard';
import HomeTestList from './components/HomeTestList';
import PageViewTracker from './components/PageViewTracker';

// Always render against the live DB at request time. This page has a DEMO_TESTS fallback (so the
// build succeeds with no database), and as an ISR/prerendered page it would BAKE that demo snapshot
// into the cache at build time — shipping fake tests whose slugs 404 (e.g. /test/psa) to the first
// visitors after every deploy. force-dynamic skips build-time prerender entirely, so real users
// always get real, resolvable links; the demo fallback only appears during a genuine DB outage.
export const dynamic = 'force-dynamic';

// Demo set mirrors the original 10 primary categories, so all are isPrimary: true here — the
// secondary-facet "More filters" disclosure just won't have anything in it during a DB outage.
const DEMO_CATEGORIES = [
  { name: 'Vitamins & Minerals', slug: 'vitamins-minerals', isPrimary: true },
  { name: 'Hormones', slug: 'hormones', isPrimary: true },
  { name: 'Metabolic', slug: 'metabolic', isPrimary: true },
  { name: 'Blood Count', slug: 'blood-count', isPrimary: true },
  { name: 'Cancer Markers', slug: 'cancer-markers', isPrimary: true },
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
    const [categories, popularTests, allTests, vendorCount] = await Promise.all([
      prisma.category.findMany({
        // Only categories with at least one live test. The 2026-09-07 catalog reset cut the
        // catalog to 30 tests spanning 16 of 21 categories — without this, the remaining 5
        // categories render as filter chips that return zero results. Rows stay in the DB
        // (real membership lives in TestCategory) so widening the catalog later needs no reseed.
        where: { testCategories: { some: { test: { deletedAt: null } } } },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.test.findMany({
        where: { isPopular: true, deletedAt: null },
        include: {
          category: true,
          categories: { select: { category: { select: { slug: true } } } }, // full m2m set
          offerings: {
            // vendor filter: excludes offerings left behind by a removed vendor (offering
            // status doesn't auto-follow vendor status).
            where: { isActive: true, deletedAt: null, currentPrice: { not: null }, vendor: { isActive: true, deletedAt: null } },
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
          categories: { select: { category: { select: { slug: true } } } }, // full m2m set
          offerings: {
            // vendor filter: excludes offerings left behind by a removed vendor (offering
            // status doesn't auto-follow vendor status).
            where: { isActive: true, deletedAt: null, currentPrice: { not: null }, vendor: { isActive: true, deletedAt: null } },
            select: { currentPrice: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.vendor.count({ where: { isActive: true, deletedAt: null } }),
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
          categorySlugs: Array.from(new Set([t.category.slug, ...t.categories.map((tc) => tc.category.slug)])),
          questCode: t.questCode,
          labcorpCode: t.labcorpCode,
          minPrice: prices.length > 0 ? Math.min(...prices) : null,
          vendorCount: t.offerings.length,
        };
      });

    return {
      categories: categories.map((c) => ({ name: c.name, slug: c.slug, isPrimary: c.isPrimary })),
      popularTests: withMinPrice(popularTests),
      allTests: withMinPrice(allTests),
      testCount: allTests.length,
      vendorCount,
    };
  } catch {
    return {
      categories: DEMO_CATEGORIES,
      popularTests: DEMO_TESTS.slice(0, 6),
      allTests: DEMO_TESTS,
      testCount: DEMO_TESTS.length,
      vendorCount: 10,
    };
  }
}

export default async function Home() {
  const { categories, popularTests, allTests, testCount, vendorCount } = await getHomeData();

  return (
    <div style={{ minHeight: '100vh', background: 'oklch(0.985 0.005 260)' }}>
      <PageViewTracker />
      <Navbar />

      {/* Hero */}
      <div
        style={{
          background: 'linear-gradient(155deg, oklch(0.96 0.02 260) 0%, oklch(0.93 0.03 225) 55%, oklch(0.95 0.025 200) 100%)',
          padding: '90px 24px 110px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 55% at 50% -5%, oklch(0.56 0.087 260 / 0.1), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 700, margin: '0 auto', animation: 'fadeUp 0.6s ease' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#fff',
              border: '1px solid oklch(0.85 0.04 260)',
              borderRadius: 20,
              padding: '5px 14px',
              marginBottom: 26,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.6 0.15 155)', flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: 'oklch(0.4 0.06 260)', fontWeight: 500 }}>
              Live prices from {vendorCount} ordering services
            </span>
          </div>
          <h1 style={{ fontSize: 54, fontWeight: 700, color: 'oklch(0.2 0.04 260)', lineHeight: 1.1, letterSpacing: '-1.8px', marginBottom: 18 }}>
            Compare blood test prices
            <br />
            <span
              style={{
                background: 'linear-gradient(90deg, oklch(0.52 0.14 260), oklch(0.52 0.14 155))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              instantly
            </span>
          </h1>
          <p style={{ fontSize: 18, color: 'oklch(0.45 0.04 260)', marginBottom: 44, lineHeight: 1.55 }}>
            Stop overpaying for lab tests. Search by test name or Quest/LabCorp test number.
          </p>

          <SearchBar />

          {/* Popular chips */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
            <span style={{ fontSize: 13, color: 'oklch(0.55 0.04 260)' }}>Popular:</span>
            {popularTests.map((t) => (
              <a
                key={t.slug}
                href={`/test/${t.slug}`}
                style={{
                  padding: '6px 15px',
                  background: '#fff',
                  border: '1px solid oklch(0.85 0.04 260)',
                  borderRadius: 20,
                  fontSize: 13,
                  color: 'oklch(0.4 0.07 260)',
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
      <div style={{ background: 'oklch(0.95 0.02 260)', borderTop: '1px solid oklch(0.9 0.02 260)', borderBottom: '1px solid oklch(0.9 0.02 260)', padding: '14px 24px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'oklch(0.22 0.04 260)' }}>{vendorCount}</span>
            <span style={{ fontSize: 13, color: 'oklch(0.5 0.04 260)' }}>Ordering Services</span>
          </div>
          <div style={{ width: 1, height: 28, background: 'oklch(0.85 0.02 260)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'oklch(0.22 0.04 260)' }}>{testCount}</span>
            <span style={{ fontSize: 13, color: 'oklch(0.5 0.04 260)' }}>Common Tests</span>
          </div>
          <div style={{ width: 1, height: 28, background: 'oklch(0.85 0.02 260)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'oklch(0.45 0.16 155)' }}>Up to 70%</span>
            <span style={{ fontSize: 13, color: 'oklch(0.5 0.04 260)' }}>Savings vs retail</span>
          </div>
          <div style={{ width: 1, height: 28, background: 'oklch(0.85 0.02 260)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'oklch(0.22 0.04 260)' }}>No</span>
            <span style={{ fontSize: 13, color: 'oklch(0.5 0.04 260)' }}>Insurance required</span>
          </div>
        </div>
      </div>

      {/* Browse section */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '56px 24px 80px' }}>
        {/* Popular Tests */}
        <div style={{ marginBottom: 52 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', color: 'oklch(0.18 0.04 260)', marginBottom: 18 }}>
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
