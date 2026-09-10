// Renders a blog post body. Same "no raw HTML" principle as StaticPageBody — admin-entered content
// can never inject markup — widened with the blocks an article actually needs.
//
// Block grammar (blank line separates blocks):
//   ## Heading            → <h2>   (these are the extraction unit; write them as questions)
//   ### Heading           → <h3>
//   - item                → <ul>
//   1. item               → <ol>
//   | a | b |             → <table>, first row is the header, a |---| separator row is ignored
//   > text                → callout
//   [FIG:name]            → a diagram from BlogFigures
//   [PRICE-CHART:a,b,c]   → a live bar chart of the price spread for those test slugs
//   anything else         → <p>
//
// Inline: **bold**, [text](/path) and [text](https://…) links, and [PRICE…:slug] tokens resolved
// from live offerings. Internal links render as <Link>; external ones open in a new tab and carry
// rel="nofollow noopener" — citing authoritative sources is the point (it's what the E-E-A-T signal
// rewards), while nofollow keeps admin-authored bodies from being usable as a link farm.
import { Fragment } from 'react';
import Link from 'next/link';
import BlogFigure from './BlogFigures';
import { renderPriceToken, priceChartSlugs, type PriceFacts } from '@/lib/blog';
import PriceRangeChart from './PriceRangeChart';

const INK = 'oklch(0.2 0.04 260)';
const BODY = 'oklch(0.35 0.03 260)';

// **bold** and [label](/path). Split on both at once so they can appear in the same line.
// The link alternative requires a following "(", so a bare [PRICE:slug] falls through to the third.
const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\((?:\/|https:\/\/)[^)\s]*\)|\[PRICE(?:-RANGE|-COUNT|-DATE)?:[a-z0-9-]+\])/g;

/**
 * Inline markup, one level of nesting deep.
 *
 * Bold and link/token syntax can contain each other, and the outer alternative always wins the
 * split — `**[LH](/test/luteinizing-hormone)**` matches the bold alternative whole, so whatever is
 * inside never reaches this function's own `split()`. The fix is to recurse on the contents rather
 * than special-case one kind of thing: an earlier version resolved price tokens inside bold and
 * nothing else, which is why a linked test name inside a bold run shipped to the live blog rendered
 * as literal `[LH](/test/luteinizing-hormone)` text — fourteen of them in one article.
 *
 * The recursion terminates because each level strips its own delimiters: bold contents can't contain
 * `**` (the alternative is `[^*]+`) and a link label can't contain `]`.
 */
function inline(text: string, keyPrefix: string, prices: Prices): React.ReactNode[] {
  return text.split(INLINE).filter((p) => p != null && p !== '').map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} style={{ fontWeight: 650, color: INK }}>
          {inline(part.slice(2, -2), key, prices)}
        </strong>
      );
    }
    if (part.startsWith('[PRICE')) {
      // Resolved server-side from the same offerings the price cards use, so prose and cards agree.
      return <Fragment key={key}>{renderPriceToken(part, prices[/:([a-z0-9-]+)\]$/.exec(part)?.[1] ?? ''])}</Fragment>;
    }
    const link = /^\[([^\]]+)\]\((\/[^)\s]*|https:\/\/[^)\s]*)\)$/.exec(part);
    if (link) {
      const href = link[2]!;
      const style = { color: 'oklch(0.48 0.14 260)', textDecoration: 'underline', textUnderlineOffset: 2 } as const;
      // The label recurses too, so `[**Free T4**](/test/t4-free)` bolds instead of printing stars.
      const label = inline(link[1]!, `${key}-l`, prices);
      if (href.startsWith('/')) {
        return (
          <Link key={key} href={href} style={style}>
            {label}
          </Link>
        );
      }
      return (
        <a key={key} href={href} target="_blank" rel="nofollow noopener" style={style}>
          {label}
        </a>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

function TableBlock({ lines, k, prices }: { lines: string[]; k: string; prices: Prices }) {
  // `| a | b |` rows. A `|---|---|` separator row is conventional in the source but carries no data.
  const rows = lines
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c)));
  if (rows.length === 0) return null;
  const [head, ...body] = rows;

  const cell: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid oklch(0.94 0.012 260)', textAlign: 'left', verticalAlign: 'top' };

  return (
    // Wide tables scroll inside their own box rather than pushing the article sideways.
    <div style={{ overflowX: 'auto', margin: '24px 0', background: '#fff', border: '1.5px solid oklch(0.92 0.02 260)', borderRadius: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: 'oklch(0.97 0.015 260)' }}>
            {/* Header cells go through `inline` like every other cell — a bold or linked column
                label would otherwise print its own markup. */}
            {head!.map((c, i) => (
              <th key={i} scope="col" style={{ ...cell, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'oklch(0.5 0.05 260)', borderBottom: '1.5px solid oklch(0.92 0.02 260)' }}>
                {inline(c, `${k}-h-${i}`, prices)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" style={{ ...cell, fontWeight: 600, color: INK }}>
                    {inline(c, `${k}-${i}-${j}`, prices)}
                  </th>
                ) : (
                  <td key={j} style={{ ...cell, color: BODY }}>
                    {inline(c, `${k}-${i}-${j}`, prices)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type Prices = Record<string, PriceFacts>;

export default function BlogBody({ body, prices = {} }: { body: string; prices?: Prices }) {
  const blocks = body.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  return (
    <Fragment>
      {blocks.map((block, i) => {
        const k = `b${i}`;
        const lines = block.split('\n').map((l) => l.trim());

        const fig = /^\[FIG:([a-z0-9-]+)\]$/.exec(block);
        if (fig) return <BlogFigure key={k} name={fig[1]!} />;

        const chartSlugs = priceChartSlugs(block);
        if (chartSlugs.length > 0) {
          // Slugs with no live price are dropped rather than drawn as empty bars.
          const rows = chartSlugs
            .map((slug) => (prices[slug] ? { slug, ...prices[slug]! } : null))
            .filter((r): r is { slug: string } & PriceFacts => r != null);
          return <PriceRangeChart key={k} rows={rows} />;
        }

        if (block.startsWith('## ')) {
          return (
            <h2 key={k} style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.5px', color: INK, margin: '38px 0 12px', lineHeight: 1.25 }}>
              {block.slice(3).trim()}
            </h2>
          );
        }
        if (block.startsWith('### ')) {
          return (
            <h3 key={k} style={{ fontSize: 18, fontWeight: 650, color: INK, margin: '28px 0 10px' }}>
              {block.slice(4).trim()}
            </h3>
          );
        }
        if (block.startsWith('> ')) {
          return (
            <aside key={k} style={{ margin: '24px 0', padding: '14px 18px', borderLeft: '3px solid oklch(0.6 0.12 260)', background: 'oklch(0.97 0.015 260)', borderRadius: '0 10px 10px 0', fontSize: 14.5, color: BODY, lineHeight: 1.7 }}>
              {inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '), k, prices)}
            </aside>
          );
        }
        if (lines.every((l) => l.startsWith('| '))) {
          return <TableBlock key={k} lines={lines} k={k} prices={prices} />;
        }
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={k} style={{ margin: '18px 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 16, color: BODY, lineHeight: 1.75, listStyle: 'disc' }}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2).trim(), `${k}-${j}`, prices)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\.\s/.test(l))) {
          return (
            <ol key={k} style={{ margin: '18px 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 16, color: BODY, lineHeight: 1.75, listStyle: 'decimal' }}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\d+\.\s*/, ''), `${k}-${j}`, prices)}</li>
              ))}
            </ol>
          );
        }

        return (
          <p key={k} style={{ margin: '0 0 18px', fontSize: 16.5, color: BODY, lineHeight: 1.78 }}>
            {inline(lines.join(' '), k, prices)}
          </p>
        );
      })}
    </Fragment>
  );
}
