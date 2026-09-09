// A strip of links to blog articles, shown on test pages, category pages and other articles.
// Presentational only — each page runs its own query from lib/guides.ts and passes the result here.
import Link from 'next/link';
import type { GuideLink } from '@/lib/guides';

interface Props {
  guides: GuideLink[];
  heading: string;
  /** Shown under the heading. Skip it where the heading already says everything. */
  intro?: string;
  /** Test/category pages sit inside a wide container; articles are a narrow column. */
  maxWidth?: number;
}

export default function GuideLinks({ guides, heading, intro, maxWidth }: Props) {
  if (guides.length === 0) return null;

  return (
    <section
      aria-labelledby="guides-heading"
      style={{ maxWidth, margin: maxWidth ? '0 auto' : undefined, padding: maxWidth ? '0 24px 64px' : undefined, marginTop: 44 }}
    >
      <h2 id="guides-heading" style={{ fontSize: 19, fontWeight: 700, color: 'oklch(0.2 0.04 260)', marginBottom: intro ? 4 : 14 }}>
        {heading}
      </h2>
      {intro && <p style={{ fontSize: 13.5, color: 'oklch(0.52 0.03 260)', margin: '0 0 14px' }}>{intro}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {guides.map((g) => (
          <Link
            key={g.slug}
            href={`/blog/${g.slug}`}
            style={{ display: 'block', background: '#fff', border: '1.5px solid oklch(0.92 0.02 260)', borderRadius: 12, padding: '15px 18px', textDecoration: 'none' }}
          >
            <div style={{ fontSize: 14.5, fontWeight: 650, color: 'oklch(0.2 0.04 260)', marginBottom: 5, lineHeight: 1.35 }}>{g.title}</div>
            {/* Two-line clamp: the excerpt is a full answer paragraph, far longer than a card wants. */}
            <div
              style={{
                fontSize: 12.5,
                color: 'oklch(0.5 0.03 260)',
                lineHeight: 1.55,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {g.excerpt}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
