// Full-text search results page. Wired to the SearchBar's "Compare" button / plain Enter (a deep
// suggestion click still jumps straight to the test). Runs the same FTS `search()` the API uses,
// server-side, then hydrates each hit with its min self-pay price for the card.
import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@labprice/database';
import { search } from '@/lib/services/search-service';
import { logSearch } from '@/lib/services/analytics-service';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import TestCard from '../components/TestCard';

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const term = (q ?? '').trim();
  return {
    title: term ? `Search: ${term} — LabTestCompare` : 'Search — LabTestCompare',
    // Search results pages shouldn't be indexed (thin/duplicative); canonical content is the test pages.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const term = (q ?? '').trim();

  const results = term ? await search(term, 40) : [];

  // Attach min price per test in one query, preserving the FTS rank order from `search()`.
  const ids = results.map((r) => r.id);
  const offerings = ids.length
    ? await prisma.offering.findMany({
        where: { testId: { in: ids }, isActive: true, deletedAt: null, currentPrice: { not: null } },
        select: { testId: true, currentPrice: true },
      })
    : [];
  const minByTest = new Map<string, number>();
  for (const o of offerings) {
    const price = Number(o.currentPrice);
    const cur = minByTest.get(o.testId);
    if (cur == null || price < cur) minByTest.set(o.testId, price);
  }

  const cards = results.map((r) => ({
    name: r.name,
    slug: r.slug,
    category: r.category.name,
    minPrice: minByTest.get(r.id) ?? null,
  }));

  // Fire-and-forget analytics — feeds the admin "zero-result searches" view (what to add next).
  if (term) logSearch({ query: term, resultsCount: cards.length });

  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.985 0.005 230)' }}>
      <Navbar />
      <div className="max-w-[1240px] mx-auto px-6 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-[oklch(0.5_0.04_230)] mb-6">
          <Link href="/" className="hover:text-[oklch(0.35_0.04_230)] no-underline text-inherit">
            Home
          </Link>
          <span>/</span>
          <span className="text-[oklch(0.3_0.04_230)] font-medium">Search</span>
        </nav>

        <h1 className="text-[32px] font-bold text-[oklch(0.18_0.04_230)] tracking-[-0.5px] mb-2">
          {term ? <>Results for &ldquo;{term}&rdquo;</> : 'Search'}
        </h1>

        {!term ? (
          <p className="text-[oklch(0.5_0.04_230)] mb-8">Type a test name in the search bar to compare prices.</p>
        ) : (
          <p className="text-[oklch(0.5_0.04_230)] mb-8">
            {cards.length} {cards.length === 1 ? 'test' : 'tests'} matched.
          </p>
        )}

        {cards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {cards.map((t) => (
              <TestCard key={t.slug} name={t.name} slug={t.slug} category={t.category} minPrice={t.minPrice} />
            ))}
          </div>
        ) : term ? (
          <div className="text-center py-12">
            <p className="text-[oklch(0.5_0.04_230)] mb-2">No tests matched &ldquo;{term}&rdquo;.</p>
            <p className="text-[13px] text-[oklch(0.6_0.04_230)]">
              Try a different spelling, or{' '}
              <Link href="/" className="underline text-[oklch(0.45_0.09_230)]">
                browse tests by category
              </Link>
              .
            </p>
          </div>
        ) : null}
      </div>
      <Footer />
    </div>
  );
}
