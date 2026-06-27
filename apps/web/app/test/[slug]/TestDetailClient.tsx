'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Offering {
  id: string;
  vendorName: string;
  vendorSlug: string;
  price: number;
  externalUrl: string | null;
}

interface Biomarker {
  name: string;
  unit: string | null;
  description: string | null;
}

interface TestInfo {
  name: string;
  slug: string;
  category: string;
  categorySlug: string;
  description: string | null;
  purpose: string | null;
  procedure: string | null;
  preparation: string | null;
  normalRange: string | null;
  questCode: string | null;
  labcorpCode: string | null;
}

interface Props {
  test: TestInfo;
  offerings: Offering[];
  biomarkers: Biomarker[];
}

const ACC_ICONS = {
  about: { path: 'M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM9 2v4h4M5 8h6M5 11h4', bg: 'oklch(0.93 0.05 280)', color: 'oklch(0.45 0.15 280)' },
  biomarkers: { path: 'M8 3v10M3 8h10', bg: 'oklch(0.93 0.05 180)', color: 'oklch(0.4 0.12 180)' },
  procedure: { path: 'M8 3v10M3 8h10', bg: 'oklch(0.93 0.05 220)', color: 'oklch(0.4 0.12 220)' },
  prep: { path: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 5v3.5l2.5 1.5', bg: 'oklch(0.93 0.05 145)', color: 'oklch(0.4 0.14 145)' },
  ranges: { path: 'M2 12l3-4 3 2.5 3-6 3 2', bg: 'oklch(0.93 0.05 300)', color: 'oklch(0.4 0.14 300)' },
};

export default function TestDetailClient({ test, offerings, biomarkers }: Props) {
  const [sortBy, setSortBy] = useState<'price' | 'alpha'>('price');
  const [openSection, setOpenSection] = useState<string | null>('about');

  const sorted = [...offerings].sort((a, b) =>
    sortBy === 'alpha' ? a.vendorName.localeCompare(b.vendorName) : a.price - b.price,
  );

  const cheapest = offerings.length > 0 ? offerings.reduce((a, b) => (a.price < b.price ? a : b)) : null;
  const most = offerings.length > 0 ? offerings.reduce((a, b) => (a.price > b.price ? a : b)) : null;
  const savings = cheapest && most ? most.price - cheapest.price : 0;

  const sections = [
    { id: 'about', title: 'About This Test', content: [test.description, test.purpose].filter(Boolean).join(' ') },
    ...(biomarkers.length > 0
      ? [{ id: 'biomarkers', title: 'Included Biomarkers', content: biomarkers.map((b) => b.name).join(', ') }]
      : []),
    { id: 'procedure', title: 'How It\'s Performed', content: test.procedure },
    { id: 'prep', title: 'How To Prepare', content: test.preparation },
    { id: 'ranges', title: 'Normal Ranges', content: test.normalRange },
  ].filter((s) => s.content);

  const isPriceSorted = sortBy === 'price';

  return (
    <div className="max-w-[1240px] mx-auto px-6 pt-7 pb-20">
      {/* Breadcrumb */}
      <div className="flex items-center gap-[7px] mb-5 text-[13px] text-[oklch(0.58_0.04_280)]">
        <Link href="/" className="text-[oklch(0.52_0.15_280)] font-medium hover:underline no-underline">
          Home
        </Link>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>{test.category}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-[oklch(0.2_0.04_280)] font-semibold">{test.name}</span>
      </div>

      {/* Test header */}
      <div className="mb-2.5">
        <h1 className="text-4xl font-bold tracking-[-0.8px] text-[oklch(0.15_0.04_280)] mb-2">{test.name}</h1>
        <div className="flex items-center gap-2.5 flex-wrap mb-3">
          {test.questCode && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[oklch(0.95_0.02_280)] rounded-pill border border-[oklch(0.9_0.03_280)]">
              <span className="text-[11px] font-bold text-[oklch(0.55_0.08_280)] uppercase tracking-[0.4px]">Quest</span>
              <span className="text-[13px] font-semibold text-[oklch(0.25_0.04_280)]">#{test.questCode}</span>
            </div>
          )}
          {test.labcorpCode && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[oklch(0.95_0.02_280)] rounded-pill border border-[oklch(0.9_0.03_280)]">
              <span className="text-[11px] font-bold text-[oklch(0.55_0.08_280)] uppercase tracking-[0.4px]">LabCorp</span>
              <span className="text-[13px] font-semibold text-[oklch(0.25_0.04_280)]">#{test.labcorpCode}</span>
            </div>
          )}
          <span className="text-[13px] text-[oklch(0.55_0.04_280)]">
            {offerings.length} ordering services compared
          </span>
        </div>
        {(test.description || test.purpose) && (
          <p className="text-[15px] text-[oklch(0.5_0.03_280)] leading-[1.65] max-w-[680px]">
            {test.description} {test.purpose}
          </p>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-7 items-start mt-7">
        {/* Left: Accordion */}
        <div className="lg:sticky lg:top-20">
          {sections.map((sec) => {
            const icon = ACC_ICONS[sec.id as keyof typeof ACC_ICONS] ?? ACC_ICONS.about;
            const isOpen = openSection === sec.id;
            return (
              <div
                key={sec.id}
                className="bg-white rounded-[13px] mb-2.5 border-[1.5px] border-[oklch(0.92_0.02_280)] overflow-hidden"
              >
                <button
                  onClick={() => setOpenSection(isOpen ? null : sec.id)}
                  className="w-full flex items-center justify-between px-[18px] py-[15px] cursor-pointer bg-transparent border-none hover:bg-[oklch(0.99_0.008_280)] transition-colors"
                >
                  <div className="flex items-center gap-[11px]">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: icon.bg }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d={icon.path} stroke={icon.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-[oklch(0.2_0.04_280)] text-left">{sec.title}</span>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="shrink-0 transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  >
                    <path d="M4 6l4 4 4-4" stroke="oklch(0.6 0.04 280)" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="px-[18px] pb-[18px] pt-1 border-t border-[oklch(0.94_0.01_280)]">
                    <p className="text-sm text-[oklch(0.42_0.03_280)] leading-[1.75] mt-3.5">{sec.content}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: Price comparison */}
        <div>
          {/* Sort controls */}
          <div className="flex items-center gap-2.5 mb-[18px] flex-wrap">
            <span className="text-[13px] font-medium text-[oklch(0.52_0.04_280)]">Sort by:</span>
            <div className="flex bg-white border-[1.5px] border-[oklch(0.9_0.02_280)] rounded-btn p-[3px] gap-0.5">
              <button
                onClick={() => setSortBy('price')}
                className="flex items-center gap-1.5 px-4 py-[7px] rounded-[7px] border-none text-[13px] font-medium cursor-pointer transition-all duration-150"
                style={{
                  background: isPriceSorted ? 'oklch(0.58 0.22 280)' : 'transparent',
                  color: isPriceSorted ? '#fff' : 'oklch(0.5 0.05 280)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M2 7l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Price
              </button>
              <button
                onClick={() => setSortBy('alpha')}
                className="flex items-center gap-1.5 px-4 py-[7px] rounded-[7px] border-none text-[13px] font-medium cursor-pointer transition-all duration-150"
                style={{
                  background: !isPriceSorted ? 'oklch(0.58 0.22 280)' : 'transparent',
                  color: !isPriceSorted ? '#fff' : 'oklch(0.5 0.05 280)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 9l3-6 3 6M2.5 7h3M8 3v6M8 9h3M8 6h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                A &ndash; Z
              </button>
            </div>
          </div>

          {/* Best price banner */}
          {cheapest && (
            <div
              className="flex items-center gap-3.5 rounded-[13px] px-5 py-[15px] mb-4 border-[1.5px]"
              style={{
                background: 'oklch(0.96 0.05 75)',
                borderColor: 'oklch(0.86 0.1 75)',
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xl text-white leading-none"
                style={{ background: 'oklch(0.52 0.17 75)' }}
              >
                &#9733;
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.6px]" style={{ color: 'oklch(0.4 0.12 75)' }}>
                  Best Price
                </div>
                <div className="text-[17px] font-bold mt-0.5" style={{ color: 'oklch(0.25 0.12 75)' }}>
                  {cheapest.vendorName} &middot; ${cheapest.price.toFixed(2)}
                </div>
              </div>
              {savings > 0 && (
                <div className="ml-auto text-right">
                  <div className="text-[11px]" style={{ color: 'oklch(0.48 0.1 75)' }}>
                    vs. most expensive
                  </div>
                  <div className="text-base font-bold mt-0.5" style={{ color: 'oklch(0.38 0.15 75)' }}>
                    Save ${savings.toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Price table */}
          <div className="bg-white rounded-card border-[1.5px] border-[oklch(0.92_0.02_280)] overflow-hidden">
            {/* Header */}
            <div
              className="grid px-5 py-[11px] border-b-[1.5px] border-[oklch(0.92_0.02_280)]"
              style={{ gridTemplateColumns: '1fr 90px 80px', background: 'oklch(0.97 0.015 280)' }}
            >
              <span className="text-[11px] font-bold text-[oklch(0.55_0.05_280)] uppercase tracking-[0.6px]">
                Ordering Service
              </span>
              <span className="text-[11px] font-bold text-[oklch(0.55_0.05_280)] uppercase tracking-[0.6px] text-right">
                Price
              </span>
              <span className="text-[11px] font-bold text-[oklch(0.55_0.05_280)] uppercase tracking-[0.6px] text-right">
                Order
              </span>
            </div>
            {sorted.map((row) => {
              const isBest = cheapest && row.price === cheapest.price;
              return (
                <div
                  key={row.id}
                  className="grid items-center px-5 py-[13px] border-b border-[oklch(0.96_0.01_280)] transition-colors"
                  style={{
                    gridTemplateColumns: '1fr 90px 80px',
                    background: isBest ? 'oklch(0.97 0.05 75)' : '#fff',
                  }}
                >
                  <div>
                    <div
                      className="text-[15px]"
                      style={{
                        fontWeight: isBest ? 700 : 500,
                        color: isBest ? 'oklch(0.28 0.14 75)' : 'oklch(0.2 0.04 280)',
                      }}
                    >
                      {row.vendorName}
                    </div>
                    {isBest && (
                      <div className="text-[10px] font-bold uppercase tracking-[0.4px] mt-px" style={{ color: 'oklch(0.4 0.12 75)' }}>
                        &#10003; Best Price
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span
                      className="text-lg font-bold"
                      style={{ color: isBest ? 'oklch(0.35 0.18 75)' : 'oklch(0.38 0.18 280)' }}
                    >
                      ${row.price.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-right">
                    <a
                      href={`/api/v1/go/${row.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-3 py-1.5 rounded-[7px] text-xs font-semibold cursor-pointer no-underline border-[1.5px] transition-colors"
                      style={{
                        background: isBest ? 'oklch(0.52 0.17 75)' : '#fff',
                        color: isBest ? '#fff' : 'oklch(0.45 0.14 280)',
                        borderColor: isBest ? 'oklch(0.52 0.17 75)' : 'oklch(0.84 0.04 280)',
                      }}
                    >
                      Order
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Disclaimer */}
          <div className="mt-3.5 px-4 py-3 rounded-btn border border-[oklch(0.92_0.01_280)] flex items-start gap-[9px]" style={{ background: 'oklch(0.97 0.01 280)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5">
              <circle cx="7" cy="7" r="6" stroke="oklch(0.62 0.04 280)" strokeWidth="1.4" />
              <path d="M7 6v4M7 4.5h0" stroke="oklch(0.62 0.04 280)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <p className="text-xs text-[oklch(0.55_0.03_280)] leading-relaxed">
              These are online lab ordering services — not the physical draw site. Once you purchase a
              requisition, you visit a nearby Quest or LabCorp patient service center for your blood draw.
              Prices are self-pay cash rates and may vary by location.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
