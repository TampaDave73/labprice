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
import { popularTestOrder } from '@/lib/popular-tests';

/** Tests shown in the "Most looked-at tests" row — one clean row of three at every breakpoint. */
const POPULAR_COUNT = 6;

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
    const [categories, allTests, vendorCount, popularOrder] = await Promise.all([
      prisma.category.findMany({
        // Only categories with at least one live test. The 2026-09-07 catalog reset cut the
        // catalog to 30 tests spanning 16 of 21 categories — without this, the remaining 5
        // categories render as filter chips that return zero results. Rows stay in the DB
        // (real membership lives in TestCategory) so widening the catalog later needs no reseed.
        where: { testCategories: { some: { test: { deletedAt: null } } } },
        orderBy: { displayOrder: 'asc' },
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
      // What people actually viewed, searched for and clicked through to — see lib/popular-tests.ts.
      popularTestOrder(),
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
          isPopular: t.isPopular,
          displayOrder: t.displayOrder,
        };
      });

    const mapped = withMinPrice(allTests);
    const byId = new Map(mapped.map((t) => [t.id, t]));

    // Behaviour first, curated list second. `popularOrder.ids` is every test with any measured
    // interest, ranked; the curated `isPopular` flags backfill the remaining slots so the row is
    // always full — including on the day a new test is added and nobody has seen it yet.
    const ranked = popularOrder.ids.map((id) => byId.get(id)).filter((t) => t != null);
    const curated = mapped
      .filter((t) => t.isPopular)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const popularTests = Array.from(new Set([...ranked, ...curated, ...mapped])).slice(0, POPULAR_COUNT);

    return {
      categories: categories.map((c) => ({ name: c.name, slug: c.slug, isPrimary: c.isPrimary })),
      popularTests,
      popularFromBehavior: popularOrder.dataDriven,
      allTests: mapped,
      testCount: allTests.length,
      vendorCount,
    };
  } catch {
    return {
      categories: DEMO_CATEGORIES,
      popularTests: DEMO_TESTS.slice(0, POPULAR_COUNT),
      popularFromBehavior: false,
      allTests: DEMO_TESTS,
      testCount: DEMO_TESTS.length,
      vendorCount: 10,
    };
  }
}

export default async function Home() {
  const { categories, popularTests, popularFromBehavior, allTests, testCount, vendorCount } = await getHomeData();

  return (
    <div style={{ minHeight: '100vh', background: 'oklch(0.985 0.005 260)' }}>
      <PageViewTracker />
      <Navbar />

      <main id="main">
      {/* Hero. Deliberately short: it used to run 90px/110px of padding around a 54px headline and a
          badge, which pushed the first actual test link most of a screen below the fold on a laptop.
          The live-prices badge now lives in the header (visible on every page, not just this one),
          so what is left here is the sentence that says what the site is, the search field, and the
          six tests people are actually looking at. */}
      <div
        style={{
          background: 'linear-gradient(155deg, oklch(0.96 0.02 260) 0%, oklch(0.93 0.03 225) 55%, oklch(0.95 0.025 200) 100%)',
          padding: '36px 24px 34px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 55% at 50% -5%, oklch(0.56 0.087 260 / 0.1), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 700, color: 'oklch(0.2 0.04 260)', lineHeight: 1.12, letterSpacing: '-1.2px', margin: '0 0 12px', textWrap: 'balance' }}>
            Compare blood test prices across{' '}
            <span
              style={{
                background: 'linear-gradient(90deg, oklch(0.52 0.14 260), oklch(0.52 0.14 155))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {vendorCount} ordering services
            </span>
          </h1>
          {/* Answer-first: this is the paragraph an AI answer engine quotes when asked what
              LabTestCompare is, so it states what the site does, who draws the blood, and what it
              costs the reader — in one sentence, with counts derived rather than written. */}
          <p style={{ fontSize: 16, color: 'oklch(0.42 0.04 260)', margin: '0 0 20px', lineHeight: 1.5, textWrap: 'pretty' }}>
            LabTestCompare is a free, independent price comparison for self-pay blood tests: search
            any of {testCount} common tests by name or by Quest/LabCorp test number and see what each
            service charges for the identical lab test. No insurance, no appointment with us — the
            draw happens at a Quest Diagnostics or LabCorp patient service center.
          </p>

          <SearchBar />
        </div>
      </div>

      {/* Browse section */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 24px 56px' }}>
        {/* Most looked-at tests */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 14 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', color: 'oklch(0.18 0.04 260)', margin: 0 }}>
              {popularFromBehavior ? 'Most looked-at tests right now' : 'Commonly ordered tests'}
            </h2>
            {/* Two captions, not one, because the two lists are not the same claim. Saying "what
                visitors are viewing" while rendering a hand-curated list would be a lie the code
                can't see. */}
            <p style={{ fontSize: 12.5, color: 'oklch(0.5 0.04 260)', margin: 0 }}>
              {popularFromBehavior
                ? 'Ranked by what visitors searched, viewed and clicked through to over the last 60 days.'
                : 'A starting set while we gather enough visitor data to rank these by demand.'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 14 }}>
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
      </main>

      <Footer />
    </div>
  );
}
