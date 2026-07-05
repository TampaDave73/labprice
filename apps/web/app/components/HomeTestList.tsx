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
  categorySlugs?: string[]; // full category set (a test can be in several)
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
    let list = activeCategory === 'all'
      ? tests
      : tests.filter((t) => (t.categorySlugs ?? [t.categorySlug]).includes(activeCategory));
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
      <div className="flex items-center justify-between flex-wrap" style={{ gap: 16, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', color: 'oklch(0.18 0.04 230)', margin: 0 }}>
            All Tests
          </h2>
          <p style={{ fontSize: 14, color: 'oklch(0.52 0.03 230)', marginTop: 4, margin: '4px 0 0' }}>
            {testCount} tests &middot; search by name or code above
          </p>
        </div>
        <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
          <CategoryTabs categories={categories} active={activeCategory} onChange={setActiveCategory} />
          <div
            className="flex"
            style={{
              background: '#fff',
              border: '1.5px solid oklch(0.9 0.02 230)',
              borderRadius: 9,
              padding: 2,
              gap: 2,
            }}
          >
            <button
              onClick={() => setSortBy('name')}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 150ms',
                background: isName ? 'oklch(0.58 0.136 230)' : 'transparent',
                color: isName ? '#fff' : 'oklch(0.5 0.05 230)',
              }}
            >
              A &ndash; Z
            </button>
            <button
              onClick={() => setSortBy('price')}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 150ms',
                background: !isName ? 'oklch(0.58 0.136 230)' : 'transparent',
                color: !isName ? '#fff' : 'oklch(0.5 0.05 230)',
              }}
            >
              Price &uarr;
            </button>
          </div>
        </div>
      </div>

      {/* List table */}
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          border: '1.5px solid oklch(0.92 0.02 230)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 140px 90px 28px',
            alignItems: 'center',
            padding: '10px 18px',
            background: 'oklch(0.97 0.015 230)',
            borderBottom: '1.5px solid oklch(0.92 0.02 230)',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.55 0.05 230)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Test</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.55 0.05 230)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Category</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.55 0.05 230)', textTransform: 'uppercase', letterSpacing: '0.6px', textAlign: 'right' }}>
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
              className="no-underline"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 140px 90px 28px',
                alignItems: 'center',
                padding: '13px 18px',
                borderBottom: '1px solid oklch(0.96 0.01 230)',
                cursor: 'pointer',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'oklch(0.97 0.02 230)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'oklch(0.18 0.04 230)' }}>{row.name}</div>
                <div style={{ fontSize: 11, color: 'oklch(0.6 0.04 230)', marginTop: 2 }}>
                  {row.questCode ? `Quest ${row.questCode}` : ''}
                  {row.questCode && row.labcorpCode ? ' · ' : ''}
                  {row.labcorpCode ? `LabCorp ${row.labcorpCode}` : ''}
                </div>
              </div>
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '3px 9px',
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.4px',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    background: cat.bg,
                    color: cat.color,
                  }}
                >
                  {row.category}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'oklch(0.38 0.17 145)' }}>
                  {row.minPrice != null ? `$${Math.round(row.minPrice)}` : '--'}
                </span>
              </div>
              <div style={{ textAlign: 'right', color: 'oklch(0.65 0.06 230)' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M4 3l5 4-5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
            </Link>
          );
        })}

        {visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'oklch(0.55 0.04 230)' }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ display: 'block', margin: '0 auto 12px' }}>
              <circle cx="17" cy="17" r="10" stroke="oklch(0.75 0.05 230)" strokeWidth="2.5" />
              <path d="M24 24l8 8" stroke="oklch(0.75 0.05 230)" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'oklch(0.35 0.04 230)', marginBottom: 6 }}>No tests found</div>
            <div style={{ fontSize: 14 }}>Try a different search term, code, or category</div>
          </div>
        )}
      </div>

      {showMoreVisible && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              padding: '9px 22px',
              background: '#fff',
              border: '1.5px solid oklch(0.88 0.03 230)',
              borderRadius: 9,
              fontSize: 14,
              fontWeight: 500,
              color: 'oklch(0.45 0.074 230)',
              cursor: 'pointer',
            }}
          >
            {showAll ? 'Show fewer ↑' : `View all ${filtered.length} tests ↓`}
          </button>
        </div>
      )}
    </div>
  );
}
