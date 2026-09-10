// "Who wrote this and when was it last true" — the block that closes out a programmatic page.
//
// Both SEO audits scored the test and category pages down for the same three absences: no author
// byline, no publication/modification date, and no external citations. On a YMYL health-adjacent
// page those aren't cosmetic — they're the signals a reader (and an answer engine) uses to decide
// whether to trust a number. The data is real: `updated` is the freshest price verification across
// the vendors on the page, not a row-touch timestamp, so this can't claim a freshness we don't have.
import Link from 'next/link';

/** House sources. Both checked to return 200 before being added; re-check before changing either. */
const SOURCES = [
  { href: 'https://medlineplus.gov/lab-tests/', label: 'MedlinePlus: Lab Tests (NIH)' },
  { href: 'https://www.cdc.gov/', label: 'CDC' },
];

export default function PageProvenance({
  updated,
  what = 'Prices',
  maxWidth = 1240,
  flush = false,
}: {
  /** ISO timestamp of the freshest verification behind this page, or null if nothing to claim. */
  updated?: string | null;
  /** What the date refers to, so the sentence reads truthfully on a page that isn't about prices. */
  what?: string;
  maxWidth?: number;
  /** True when the parent already supplies the horizontal gutter (the category page's `px-6`). */
  flush?: boolean;
}) {
  return (
    <section
      aria-label="Page provenance"
      style={{ maxWidth, margin: '0 auto', padding: flush ? '32px 0 0' : '0 24px 40px' }}
    >
      <div
        style={{
          border: '1px solid oklch(0.9 0.015 260)',
          background: '#fff',
          borderRadius: 12,
          padding: '14px 18px',
          fontSize: 12.5,
          lineHeight: 1.65,
          color: 'oklch(0.42 0.03 260)',
        }}
      >
        <p style={{ margin: 0 }}>
          <strong style={{ fontWeight: 600, color: 'oklch(0.25 0.04 260)' }}>
            Compiled by the LabTestCompare editorial team.
          </strong>{' '}
          {what} are collected from each ordering service&rsquo;s own published catalog and re-checked
          on a schedule — see our{' '}
          <Link href="/editorial-policy" style={{ color: 'oklch(0.45 0.14 260)' }}>
            editorial policy
          </Link>{' '}
          for how we source and correct them.
          {updated && (
            <>
              {' '}
              {what} on this page were last verified{' '}
              {/* Machine-readable date. Visible text alone is not a date signal. */}
              <time dateTime={updated} style={{ fontWeight: 600, color: 'oklch(0.25 0.04 260)' }}>
                {new Date(updated).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </time>
              .
            </>
          )}
        </p>
        <p style={{ margin: '8px 0 0' }}>
          Background reading on lab testing:{' '}
          {SOURCES.map((s, i) => (
            <span key={s.href}>
              {i > 0 && ' · '}
              <a
                href={s.href}
                target="_blank"
                rel="nofollow noopener"
                style={{ color: 'oklch(0.45 0.14 260)' }}
              >
                {s.label}
              </a>
            </span>
          ))}
          . This page is a price comparison, not medical advice — see our{' '}
          <Link href="/disclaimer" style={{ color: 'oklch(0.45 0.14 260)' }}>
            medical disclaimer
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
