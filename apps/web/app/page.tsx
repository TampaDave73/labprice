import { prisma } from '@labprice/database';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import SearchBar from './components/SearchBar';
import TestCard from './components/TestCard';
import HomeTestList from './components/HomeTestList';

async function getHomeData() {
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
          <div className="inline-flex items-center gap-2 bg-[oklch(0.95_0.06_280/0.12)] border border-[oklch(0.8_0.1_280/0.22)] rounded-pill px-3.5 py-1 mb-6">
            <span className="w-[7px] h-[7px] rounded-full bg-success-500 inline-block" />
            <span className="text-[13px] text-[oklch(0.85_0.06_280)] font-medium">
              Live prices from 10 ordering services
            </span>
          </div>
          <h1 className="text-[54px] font-bold text-white leading-[1.1] tracking-[-1.8px] mb-[18px]">
            Compare blood test prices
            <br />
            <span className="bg-gradient-to-r from-[oklch(0.75_0.2_280)] to-[oklch(0.78_0.18_315)] bg-clip-text text-transparent">
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
                className="px-[15px] py-1.5 bg-[oklch(0.95_0.06_280/0.12)] border border-[oklch(0.8_0.1_280/0.28)] rounded-pill text-[13px] text-[oklch(0.85_0.07_280)] font-medium no-underline hover:bg-[oklch(0.95_0.06_280/0.22)] transition-colors"
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
