'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import CategoryTabs from './CategoryTabs';

const CAT_COLORS: Record<string, { bg: string; color: string }> = {
  'Vitamins & Minerals': { bg: 'oklch(0.95 0.06 145)', color: 'oklch(0.35 0.14 145)' },
  Hormones: { bg: 'oklch(0.95 0.06 310)', color: 'oklch(0.38 0.14 310)' },
  Metabolic: { bg: 'oklch(0.95 0.05 220)', color: 'oklch(0.38 0.12 220)' },
  'Blood Count': { bg: 'oklch(0.95 0.06 30)', color: 'oklch(0.4 0.14 30)' },
  'Cancer Markers': { bg: 'oklch(0.95 0.05 15)', color: 'oklch(0.4 0.14 15)' },
};

const BROWSE_LIMIT = 8;

interface TestRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  categorySlug: string;
  questCode: string | null;
  labcorpCode: string | null;
  minPrice: number | null;
}

interface Props {
  tests: TestRow[];
  categories: { name: string; slug: string }[];
  testCount: number;
}

export default function HomeTestList({ tests, categories, testCount }: Props) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'price'>('name');
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    let list = activeCategory === 'all' ? tests : tests.filter((t) => t.categorySlug === activeCategory);
    if (sortBy === 'price') {
      list = [...list].sort((a, b) => (a.minPrice ?? 9999) - (b.minPrice ?? 9999));
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [tests, activeCategory, sortBy]);

  const visible = showAll ? filtered : filtered.slice(0, BROWSE_LIMIT);
  const showMoreVisible = filtered.length > BROWSE_LIMIT;

  const isName = sortBy === 'name';

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-[-0.4px] text-[oklch(0.18_0.04_280)]">All Tests</h2>
          <p className="text-sm text-[oklch(0.52_0.03_280)] mt-1">
            {testCount} tests &middot; search by name or code above
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <CategoryTabs categories={categories} active={activeCategory} onChange={setActiveCategory} />
          <div className="flex bg-white border-[1.5px] border-[oklch(0.9_0.02_280)] rounded-[9px] p-0.5 gap-0.5">
            <button
              onClick={() => setSortBy('name')}
              className="px-3 py-1.5 rounded-[6px] border-none text-xs font-medium cursor-pointer transition-all duration-150"
              style={{
                background: isName ? 'oklch(0.58 0.18 220)' : 'transparent',
                color: isName ? '#fff' : 'oklch(0.5 0.05 280)',
              }}
            >
              A &ndash; Z
            </button>
            <button
              onClick={() => setSortBy('price')}
              className="px-3 py-1.5 rounded-[6px] border-none text-xs font-medium cursor-pointer transition-all duration-150"
              style={{
                background: !isName ? 'oklch(0.58 0.18 220)' : 'transparent',
                color: !isName ? '#fff' : 'oklch(0.5 0.05 280)',
              }}
            >
              Price &uarr;
            </button>
          </div>
        </div>
      </div>

      {/* List table */}
      <div className="bg-white rounded-card border-[1.5px] border-[oklch(0.92_0.02_280)] overflow-hidden">
        {/* Header */}
        <div
          className="grid items-center px-[18px] py-2.5 border-b-[1.5px] border-[oklch(0.92_0.02_280)]"
          style={{
            gridTemplateColumns: '1fr 140px 90px 28px',
            background: 'oklch(0.97 0.015 280)',
          }}
        >
          <span className="text-[11px] font-bold text-[oklch(0.55_0.05_280)] uppercase tracking-[0.6px]">Test</span>
          <span className="text-[11px] font-bold text-[oklch(0.55_0.05_280)] uppercase tracking-[0.6px]">Category</span>
          <span className="text-[11px] font-bold text-[oklch(0.55_0.05_280)] uppercase tracking-[0.6px] text-right">
            From
          </span>
          <span />
        </div>

        {visible.map((row) => {
          const cat = CAT_COLORS[row.category] ?? { bg: '#f0f0f0', color: '#555' };
          return (
            <Link
              key={row.id}
              href={`/test/${row.slug}`}
              className="grid items-center px-[18px] py-[13px] border-b border-[oklch(0.96_0.01_280)] cursor-pointer no-underline transition-colors hover:bg-[oklch(0.97_0.02_280)]"
              style={{ gridTemplateColumns: '1fr 140px 90px 28px' }}
            >
              <div>
                <div className="text-sm font-semibold text-[oklch(0.18_0.04_280)]">{row.name}</div>
                <div className="text-[11px] text-[oklch(0.6_0.04_280)] mt-0.5">
                  {row.questCode ? `Quest ${row.questCode}` : ''}
                  {row.questCode && row.labcorpCode ? ' · ' : ''}
                  {row.labcorpCode ? `LabCorp ${row.labcorpCode}` : ''}
                </div>
              </div>
              <div>
                <span
                  className="inline-block px-2.5 py-0.5 rounded-pill text-[10px] font-bold tracking-[0.4px] uppercase whitespace-nowrap"
                  style={{ background: cat.bg, color: cat.color }}
                >
                  {row.category}
                </span>
              </div>
              <div className="text-right">
                <span className="text-base font-bold text-success-700">
                  {row.minPrice != null ? `$${Math.round(row.minPrice)}` : '--'}
                </span>
              </div>
              <div className="text-right text-[oklch(0.65_0.06_280)]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M4 3l5 4-5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
            </Link>
          );
        })}

        {visible.length === 0 && (
          <div className="text-center py-12 px-6 text-[oklch(0.55_0.04_280)]">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-3 block">
              <circle cx="17" cy="17" r="10" stroke="oklch(0.75 0.05 280)" strokeWidth="2.5" />
              <path d="M24 24l8 8" stroke="oklch(0.75 0.05 280)" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div className="text-base font-semibold text-[oklch(0.35_0.04_280)] mb-1.5">No tests found</div>
            <div className="text-sm">Try a different search term, code, or category</div>
          </div>
        )}
      </div>

      {showMoreVisible && (
        <div className="text-center mt-3.5">
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-[22px] py-2.5 bg-white border-[1.5px] border-[oklch(0.88_0.03_280)] rounded-[9px] text-sm font-medium text-[oklch(0.45_0.12_280)] cursor-pointer hover:border-[oklch(0.72_0.1_280)] hover:text-[oklch(0.38_0.15_280)] transition-all"
          >
            {showAll ? 'Show fewer ↑' : `View all ${filtered.length} tests ↓`}
          </button>
        </div>
      )}
    </div>
  );
}
