'use client';

import { useState } from 'react';
import Link from 'next/link';
import SuggestionModal from '../../components/SuggestionModal';
import { trackEvent } from '../../../lib/gtag';

interface Offering {
  id: string;
  vendorName: string;
  vendorSlug: string;
  price: number;
  memberPrice: number | null;
  membershipNote: string | null;
  // Dual-lab vendors (Dirt Cheap Labs): the other lab's price, when it also carries this test.
  altLabPrice: number | null;
  altLabProvider: string | null;
  externalUrl: string | null;
  // Last scrape VERIFICATION (lastCheckedAt, falling back to priceUpdatedAt server-side) — feeds
  // the "checked N ago" dot, so it must move on every check, not just price changes.
  checkedAt: string | null;
}

interface TestInfo {
  id: string;
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
  thirdPartyOnly: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  notes: string | null;
  cardioIq: boolean;
  labVariant: string | null;
}

interface Props {
  test: TestInfo;
  offerings: Offering[];
}

// "Prices last checked N ago" trust signal (F5). Uses the freshest offering timestamp; we surface
// recency, not staleness, so the newest check is the right one to show.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

// Per-row freshness dot color, keyed off days since last scrape: green while a scraper would still
// consider this "recently checked", amber once it's aging, gray once it's old enough to be suspect.
function freshnessColor(iso: string): string {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days < 7) return 'oklch(0.62 0.15 155)'; // green — fresh
  if (days < 30) return 'oklch(0.72 0.14 75)'; // amber — aging
  return 'oklch(0.65 0.02 260)'; // gray — stale
}

const ACC_ICONS = {
  about: { path: 'M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM9 2v4h4M5 8h6M5 11h4', bg: 'oklch(0.93 0.05 260)', color: 'oklch(0.45 0.093 260)' },
  biomarkers: { path: 'M8 3v10M3 8h10', bg: 'oklch(0.93 0.05 180)', color: 'oklch(0.4 0.12 180)' },
  procedure: { path: 'M8 3v10M3 8h10', bg: 'oklch(0.93 0.05 220)', color: 'oklch(0.4 0.12 220)' },
  prep: { path: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 5v3.5l2.5 1.5', bg: 'oklch(0.93 0.05 155)', color: 'oklch(0.4 0.14 155)' },
  ranges: { path: 'M2 12l3-4 3 2.5 3-6 3 2', bg: 'oklch(0.93 0.05 300)', color: 'oklch(0.4 0.14 300)' },
};

// Best-price highlight palette — Green theme (hue 145), matching the prototype default.
const BEST = {
  rowBg: 'oklch(0.97 0.05 155)',
  bannerBg: 'oklch(0.96 0.05 155)',
  bannerBorder: 'oklch(0.86 0.1 155)',
  label: 'oklch(0.28 0.14 155)',
  price: 'oklch(0.35 0.18 155)',
  solid: 'oklch(0.52 0.17 155)',
  title: 'oklch(0.4 0.12 155)',
  name: 'oklch(0.25 0.12 155)',
  vs: 'oklch(0.48 0.1 155)',
  savings: 'oklch(0.38 0.15 155)',
};

const ACCENT = 'oklch(0.58 0.136 260)';

// Nothing on this page renders below 12px. Sub-12px text is flagged as a mobile-readability problem
// (an audit counted 27 such elements here — the per-row "checked N ago", member-price and best-price
// labels multiply across ~18 offerings). If you add a secondary line to a row, keep it at 12.

// Section headings are phrased as the questions people actually search ("how do you prepare for a
// vitamin D test?") rather than as labels ("How To Prepare") — that's the unit search and answer
// engines segment a page by, and this page previously had no <h2> at all. Most of our test names are
// bare analytes ("Ferritin") that read wrong without a trailing noun, but some already carry one
// ("Arsenic Blood Test", "Lipid Panel"), so only add "test" when it isn't already there.
const HAS_NOUN = /\b(test|panel|profile|screen|screening|count)\b\.?$/i;
function testPhrase(name: string): string {
  return HAS_NOUN.test(name.trim()) ? name : `${name} test`;
}

// 'quest' | 'labcorp' → 'Quest' | 'LabCorp' for the dual-lab secondary-price line.
function labLabel(provider: string | null): string {
  if (provider === 'quest') return 'Quest';
  if (provider === 'labcorp') return 'LabCorp';
  return provider ?? '';
}

export default function TestDetailClient({ test, offerings }: Props) {
  const [sortBy, setSortBy] = useState<'price' | 'alpha'>('price');
  const [openSection, setOpenSection] = useState<string | null>('about');
  const [reportOpen, setReportOpen] = useState(false);

  // Freshest price-check timestamp across all listings, for the "last checked" trust line.
  const lastChecked = offerings
    .map((o) => o.checkedAt)
    .filter((t): t is string => t != null)
    .sort()
    .at(-1);

  const sorted = [...offerings].sort((a, b) =>
    sortBy === 'alpha' ? a.vendorName.localeCompare(b.vendorName) : a.price - b.price,
  );

  const cheapest = offerings.length > 0 ? offerings.reduce((a, b) => (a.price < b.price ? a : b)) : null;
  const most = offerings.length > 0 ? offerings.reduce((a, b) => (a.price > b.price ? a : b)) : null;
  const savings = cheapest && most ? most.price - cheapest.price : 0;

  // Matches the prototype's four fixed accordion sections (no biomarkers section).
  const phrase = testPhrase(test.name);
  const sections = [
    { id: 'about', title: `What does a ${phrase} measure?`, content: [test.description, test.purpose].filter(Boolean).join(' ') },
    { id: 'procedure', title: `How is a ${phrase} performed?`, content: test.procedure },
    { id: 'prep', title: `How do you prepare for a ${phrase}?`, content: test.preparation },
    { id: 'ranges', title: `What is a normal ${test.name} result?`, content: test.normalRange },
  ].filter((s) => s.content);

  const isPriceSorted = sortBy === 'price';

  // Order-code clause for the summary. Stated in prose as well as in the header chips because the
  // codes are how someone verifies we're comparing the same test across services — and a chip
  // reading "Quest #17306" doesn't extract as a fact the way a sentence does.
  const codeSentence = test.questCode && test.labcorpCode
    ? ` It is Quest test code ${test.questCode} and LabCorp test code ${test.labcorpCode}.`
    : test.questCode
      ? ` It is Quest test code ${test.questCode}.`
      : test.labcorpCode
        ? ` It is LabCorp test code ${test.labcorpCode}.`
        : '';

  const sortBtn = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    borderRadius: 7,
    border: 'none',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    background: active ? ACCENT : 'transparent',
    color: active ? '#fff' : 'oklch(0.5 0.05 260)',
  });

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 24px 80px' }}>
      <style>{`
        .td-grid { display: grid; grid-template-columns: 360px 1fr; gap: 28px; align-items: start; margin-top: 28px; }
        .td-left { position: sticky; top: 80px; }
        .td-acc-header:hover { background: oklch(0.99 0.008 260); }
        /* Belt-and-braces: [hidden] is a UA default, but any later display rule on this element
           would silently override it and re-expose every collapsed section. */
        .td-acc-body[hidden] { display: none; }
        .td-home-link:hover { text-decoration: underline; }
        .td-row:hover { background: oklch(0.97 0.02 260); }
        .td-row-best:hover { background: oklch(0.95 0.06 155); }
        @media (max-width: 900px) {
          .td-grid { grid-template-columns: 1fr; }
          .td-left { position: static; }
        }
      `}</style>

      {/* Breadcrumb — <nav>, matching category/[slug] and search, which already used one here. */}
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 20, fontSize: 13, color: 'oklch(0.58 0.04 260)' }}>
        <Link href="/" className="td-home-link" style={{ color: 'oklch(0.52 0.093 260)', fontWeight: 500, textDecoration: 'none' }}>
          Home
        </Link>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <Link href={`/category/${test.categorySlug}`} className="td-home-link" style={{ color: 'oklch(0.52 0.093 260)', fontWeight: 500, textDecoration: 'none' }}>
          {test.category}
        </Link>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span aria-current="page" style={{ color: 'oklch(0.2 0.04 260)', fontWeight: 600 }}>{test.name}</span>
      </nav>

      {/* Test header */}
      <div style={{ marginBottom: 10 }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.8px', color: 'oklch(0.15 0.04 260)', marginBottom: 8 }}>
          {test.name}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {test.questCode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'oklch(0.95 0.02 260)', borderRadius: 20, border: '1px solid oklch(0.9 0.03 260)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(0.55 0.06 260)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Quest</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'oklch(0.25 0.04 260)' }}>#{test.questCode}</span>
            </div>
          )}
          {test.labcorpCode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'oklch(0.95 0.02 260)', borderRadius: 20, border: '1px solid oklch(0.9 0.03 260)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(0.55 0.06 260)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>LabCorp</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'oklch(0.25 0.04 260)' }}>#{test.labcorpCode}</span>
            </div>
          )}
          {test.cardioIq && (
            <div style={{ padding: '4px 12px', background: 'oklch(0.95 0.05 300)', borderRadius: 20, border: '1px solid oklch(0.85 0.08 300)', fontSize: 12, fontWeight: 600, color: 'oklch(0.4 0.1 300)' }}>
              Cardio IQ&reg; branded variant{test.labVariant ? ` — ${test.labVariant}` : ''}
            </div>
          )}
          {test.confidence !== 'HIGH' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', background: 'oklch(0.97 0.05 80)', borderRadius: 20, border: '1px solid oklch(0.88 0.08 80)', fontSize: 12, fontWeight: 600, color: 'oklch(0.45 0.1 60)' }}>
              &#9888; {test.confidence === 'MEDIUM' ? 'Partially verified' : 'Unverified'} — codes may need confirmation
            </div>
          )}
          <span style={{ fontSize: 13, color: 'oklch(0.55 0.04 260)' }}>{offerings.length} ordering services compared</span>
          {lastChecked && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'oklch(0.55 0.04 260)' }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="oklch(0.6 0.06 155)" strokeWidth="1.4" />
                <path d="M7 4v3l2 1.2" stroke="oklch(0.6 0.06 155)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Prices last checked {relativeTime(lastChecked)}
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="td-grid">
        {/* Left: Accordion */}
        <div className="td-left">
          {sections.map((sec) => {
            const icon = ACC_ICONS[sec.id as keyof typeof ACC_ICONS] ?? ACC_ICONS.about;
            const isOpen = openSection === sec.id;
            return (
              <div key={sec.id} style={{ background: '#fff', borderRadius: 13, marginBottom: 10, border: '1.5px solid oklch(0.92 0.02 260)', overflow: 'hidden' }}>
                <button
                  onClick={() => setOpenSection(isOpen ? null : sec.id)}
                  aria-expanded={isOpen}
                  className="td-acc-header"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', cursor: 'pointer', background: 'transparent', border: 'none', transition: 'background 0.15s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: icon.bg }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d={icon.path} stroke={icon.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    {/* An <h2> inside the disclosure button: the heading is the question, and the
                        question is what you click. Purely semantic — styling is unchanged. */}
                    <h2 style={{ fontSize: 14, fontWeight: 600, color: 'oklch(0.2 0.04 260)', textAlign: 'left', margin: 0 }}>
                      {sec.title}
                    </h2>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  >
                    <path d="M4 6l4 4 4-4" stroke="oklch(0.6 0.04 260)" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
                {/* Always mounted, hidden with [hidden] rather than `{isOpen && ...}`. Collapsed
                    sections used to be absent from the HTML entirely, so the preparation
                    instructions and reference ranges — the most quotable content on the page —
                    were invisible to crawlers and to anything reading the page without running JS.
                    The disclosure behaves identically for users. */}
                <div
                  className="td-acc-body"
                  hidden={!isOpen}
                  style={{ padding: '4px 18px 18px', borderTop: '1px solid oklch(0.94 0.01 260)' }}
                >
                  <p style={{ fontSize: 14, color: 'oklch(0.42 0.03 260)', lineHeight: 1.75, marginTop: 14 }}>{sec.content}</p>
                </div>
              </div>
            );
          })}

          {/* Report an error — sits under the info accordions so it's visible wherever the results
              are being read. Opens the shared modal; reports land in ResultErrorReport for admin
              triage (never mutates prices directly). */}
          <div style={{ background: '#fff', borderRadius: 13, border: '1.5px solid oklch(0.92 0.02 260)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'oklch(0.95 0.04 60)' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L14.5 13.5H1.5L8 2zM8 7v3M8 12h.01" stroke="oklch(0.55 0.14 60)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span style={{ fontSize: 13, color: 'oklch(0.45 0.04 260)', lineHeight: 1.4 }}>
                Spot a wrong price or a dead link?
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 8, border: '1.5px solid oklch(0.84 0.04 260)', background: '#fff', color: 'oklch(0.45 0.087 260)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Report an error
            </button>
          </div>

          <SuggestionModal
            open={reportOpen}
            onClose={() => setReportOpen(false)}
            title="Report an error"
            intro={`See something wrong in the ${test.name} results — a price that doesn't match the vendor's site, a dead order link, a wrong code? Tell us and we'll fix it.`}
            endpoint="/api/v1/reports/result-error"
            extra={{ testId: test.id }}
            submitLabel="Send report"
            fields={[
              {
                name: 'offeringId',
                label: 'Which listing?',
                type: 'select',
                options: [
                  { value: '', label: 'General / not about one vendor' },
                  ...offerings.map((o) => ({ value: o.id, label: `${o.vendorName} — $${o.price.toFixed(2)}` })),
                ],
              },
              { name: 'message', label: "What's wrong?", type: 'textarea', required: true, placeholder: 'e.g. The vendor’s site shows $12.99, not $8.99' },
              { name: 'email', label: 'Your email (optional)', type: 'email', placeholder: 'So we can follow up' },
            ]}
          />
        </div>

        {/* Right: Price comparison */}
        <div>
          {/* Answer-first summary. The page's own question is "what does this cost and where" and
              until now that was answered only by a star badge and some colored numbers — nothing an
              answer engine (or a screen reader) could lift as a sentence. Every figure is derived
              from the same offerings the table renders, so the two can't disagree. */}
          {cheapest && (
            <section aria-labelledby="price-summary-heading" style={{ marginBottom: 18 }}>
              <h2
                id="price-summary-heading"
                style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.3px', color: 'oklch(0.18 0.04 260)', marginBottom: 8 }}
              >
                How much does a {phrase} cost?
              </h2>
              <p style={{ fontSize: 14.5, color: 'oklch(0.4 0.03 260)', lineHeight: 1.7 }}>
                The cheapest self-pay {phrase} is <strong>${cheapest.price.toFixed(2)}</strong> at{' '}
                <strong>{cheapest.vendorName}</strong>, out of {offerings.length} ordering service
                {offerings.length === 1 ? '' : 's'} compared.
                {most && savings > 0 && (
                  <> The highest listed price is ${most.price.toFixed(2)} at {most.vendorName}, a difference of ${savings.toFixed(2)}.</>
                )}
                {codeSentence}{' '}
                Prices are self-pay cash rates read from each service&rsquo;s own public catalog
                {lastChecked ? `, last verified ${relativeTime(lastChecked)}` : ''}.
              </p>
            </section>
          )}

          {/* Sort controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'oklch(0.52 0.04 260)' }}>Sort by:</span>
            <div style={{ display: 'flex', background: '#fff', border: '1.5px solid oklch(0.9 0.02 260)', borderRadius: 10, padding: 3, gap: 2 }}>
              <button onClick={() => setSortBy('price')} style={sortBtn(isPriceSorted)}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M2 7l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Price
              </button>
              <button onClick={() => setSortBy('alpha')} style={sortBtn(!isPriceSorted)}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 9l3-6 3 6M2.5 7h3M8 3v6M8 9h3M8 6h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                A &ndash; Z
              </button>
            </div>
          </div>

          {/* Best price banner */}
          {cheapest && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderRadius: 13, padding: '15px 20px', marginBottom: 16, border: '1.5px solid', background: BEST.bannerBg, borderColor: BEST.bannerBorder }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20, color: '#fff', lineHeight: 1, background: BEST.solid }}>
                &#9733;
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: BEST.title }}>Best Price</div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2, color: BEST.name }}>
                  {cheapest.vendorName} &middot; ${cheapest.price.toFixed(2)}
                </div>
              </div>
              {savings > 0 && (
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: BEST.vs }}>vs. most expensive</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: BEST.savings }}>Save ${savings.toFixed(2)}</div>
                </div>
              )}
            </div>
          )}

          {/* Price comparison. A real <table>, not the CSS grid of <div>s this used to be: the
              vendor↔price pairing is the single most valuable fact on the site, and in a grid it
              existed only as a visual coincidence of column order. Column widths come from the
              <colgroup> + table-layout:fixed, which reproduces the old '1fr 90px 80px' exactly. */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid oklch(0.92 0.02 260)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              {/* Visually hidden: the heading and summary above already say this on screen, but the
                  caption is what names the table for a screen reader or an extractor that meets the
                  <table> without its surrounding context. */}
              <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                {test.name} self-pay prices by ordering service
                {lastChecked ? `, last checked ${relativeTime(lastChecked)}` : ''}
              </caption>
              <colgroup>
                <col />
                <col style={{ width: 104 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '1.5px solid oklch(0.92 0.02 260)', background: 'oklch(0.97 0.015 260)' }}>
                  <th scope="col" style={{ padding: '11px 8px 11px 20px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'oklch(0.55 0.05 260)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Ordering Service
                  </th>
                  <th scope="col" style={{ padding: '11px 8px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'oklch(0.55 0.05 260)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Price
                  </th>
                  <th scope="col" style={{ padding: '11px 20px 11px 8px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'oklch(0.55 0.05 260)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Order
                  </th>
                </tr>
              </thead>
              <tbody>
                {offerings.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: '28px 20px', textAlign: 'center', fontSize: 14, color: 'oklch(0.5 0.04 260)' }}>
                      {test.thirdPartyOnly
                        ? 'Not offered by Quest or LabCorp — this is a specialty/third-party test.'
                        : 'No ordering services currently list this test.'}
                    </td>
                  </tr>
                ) : (
                  sorted.map((row) => {
                    const isBest = cheapest != null && row.price === cheapest.price;
                    const cell: React.CSSProperties = {
                      padding: '13px 8px',
                      verticalAlign: 'middle',
                      borderBottom: '1px solid oklch(0.96 0.01 260)',
                    };
                    return (
                      <tr
                        key={row.id}
                        className={isBest ? 'td-row-best' : 'td-row'}
                        style={{ transition: 'background 0.1s', background: isBest ? BEST.rowBg : '#fff' }}
                      >
                        <th scope="row" style={{ ...cell, paddingLeft: 20, textAlign: 'left', fontWeight: 'normal' }}>
                          <span style={{ display: 'block', fontSize: 15, fontWeight: isBest ? 700 : 500, color: isBest ? BEST.label : 'oklch(0.2 0.04 260)' }}>
                            {row.vendorName}
                          </span>
                          {/* The cheapest row is also flagged in words, not only by the row tint —
                              color carries no meaning to anything reading the markup. */}
                          {isBest && (
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 1, color: BEST.title }}>
                              &#10003; Best Price
                            </span>
                          )}
                          {row.checkedAt && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                              <span
                                style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block', background: freshnessColor(row.checkedAt) }}
                                aria-hidden="true"
                              />
                              <span style={{ fontSize: 12, color: 'oklch(0.58 0.03 260)' }}>checked {relativeTime(row.checkedAt)}</span>
                            </span>
                          )}
                        </th>
                        <td style={{ ...cell, textAlign: 'right' }}>
                          <span style={{ fontSize: 18, fontWeight: 700, color: isBest ? BEST.price : 'oklch(0.38 0.112 260)' }}>
                            ${row.price.toFixed(2)}
                          </span>
                          {/* Member price shown inline (works on mobile, unlike a tooltip). Non-member price
                              above is the compared/ranked one; this is the discounted member alternative. */}
                          {row.memberPrice != null && row.memberPrice < row.price && (
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'oklch(0.55 0.04 260)', marginTop: 2, lineHeight: 1.3 }}>
                              ${row.memberPrice.toFixed(2)} for members
                              {row.membershipNote ? <span style={{ color: 'oklch(0.62 0.03 260)' }}> ({row.membershipNote})</span> : null}
                            </span>
                          )}
                          {/* Dual-lab vendor (Dirt Cheap Labs): this test is priced through BOTH Quest and
                              LabCorp — the price above is the cheaper; the other lab is still an option. */}
                          {row.altLabPrice != null && (
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'oklch(0.55 0.04 260)', marginTop: 2, lineHeight: 1.3 }}>
                              ${row.altLabPrice.toFixed(2)} via {labLabel(row.altLabProvider)} also available
                            </span>
                          )}
                        </td>
                        <td style={{ ...cell, paddingRight: 20, textAlign: 'right' }}>
                          <a
                            href={`/api/v1/go/${row.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => trackEvent('vendor_click', { test_name: test.name, vendor_name: row.vendorName, price: row.price })}
                            aria-label={`Order ${test.name} from ${row.vendorName} for $${row.price.toFixed(2)}`}
                            style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', border: '1.5px solid', background: isBest ? BEST.solid : '#fff', color: isBest ? '#fff' : 'oklch(0.45 0.087 260)', borderColor: isBest ? BEST.solid : 'oklch(0.84 0.04 260)' }}
                          >
                            Order
                          </a>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Disclaimer */}
          <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 10, border: '1px solid oklch(0.92 0.01 260)', display: 'flex', alignItems: 'flex-start', gap: 9, background: 'oklch(0.985 0.005 260)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="7" cy="7" r="6" stroke="oklch(0.62 0.04 260)" strokeWidth="1.4" />
              <path d="M7 6v4M7 4.5h0" stroke="oklch(0.62 0.04 260)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <p style={{ fontSize: 12, color: 'oklch(0.55 0.03 260)', lineHeight: 1.6 }}>
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
