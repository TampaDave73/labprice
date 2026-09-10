// Live price chart for an article: `[PRICE-CHART:slug,slug,…]` in a post body.
//
// The site's whole thesis is "the same test costs wildly different amounts depending where you buy
// it", and that is a magnitude comparison — so: horizontal bars from a zero baseline, solid up to the
// cheapest price anyone charges, then a lighter continuation up to the highest. Solid is what you can
// pay; the faded tail is what you'd pay by not comparing.
//
// Copy is US English throughout — this is a US consumer site. "Dearest" shipped here once and had
// to be corrected; it means "most expensive" in British English and nothing useful in American.
//
// Deliberate choices, in the order they were made:
//  - Form: bars from a single zero baseline, not a floating min–max range. A floating bar has no
//    baseline, so absolute price stops being readable off position — and the point here is that $7 is
//    cheap in absolute terms, not merely cheaper than $59.
//  - Color last, and computed rather than eyeballed: accent oklch(0.55 0.14 260) and
//    oklch(0.52 0.15 155) convert to #3e6fc2 / #008140, which pass the lightness band, chroma floor,
//    adjacent CVD separation (ΔE 20.2 deutan, 22.7 normal) and 3:1 contrast against the surface.
//    Green already means "best price" everywhere else on the site, so it carries meaning, not decoration.
//  - Every value is also in the table underneath. Nothing is reachable only by color or only by
//    hovering — which also makes the figure's content extractable rather than locked in a picture.
//
// No hover tooltip layer: this renders inside the article body, which is a server component, and
// making it interactive would pull the whole article client-side for a decoration. Per-bar `<title>`
// gives a native tooltip with no JavaScript, and the table view carries the numbers regardless.
import type { PriceFacts } from '@/lib/blog';

export interface ChartRow extends PriceFacts {
  slug: string;
  name: string;
}

// Palette: the site's own tokens. Validated as a pair — see the note above.
const SPAN = 'oklch(0.55 0.14 260)'; // solid: the cheapest price
const TAIL = 'oklch(0.93 0.035 260)'; // faded: the rest of the spread
const BEST = 'oklch(0.52 0.15 155)'; // the cheapest marker, green as elsewhere on the site
const GRID = 'oklch(0.92 0.02 260)';
const INK = 'oklch(0.2 0.04 260)';
const MUTED = 'oklch(0.5 0.04 260)';

const NAME_W = 196;
const PLOT_X = 206;
const PLOT_R = 640;
const ROW_H = 44;
const BAR_H = 18;
const TOP = 16;

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * An axis whose ticks are round numbers. Quartering a "nice" maximum isn't enough — 150/4 gives
 * $38, $75, $113, which reads as noise. Pick the step first, then let the top follow from it.
 */
function niceScale(max: number): { top: number; ticks: number[] } {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  // 3–5 intervals: fewer and the axis is uninformative, more and the labels crowd.
  const step = steps.find((st) => max / st <= 5) ?? Math.ceil(max / 5 / 100) * 100;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}

// Past about eight bars the figure is taller than the screen and the rows stop being comparable at a
// glance, so the plot caps and the table carries the rest. Cheapest first — the ranking is the point.
const MAX_BARS = 8;

export default function PriceRangeChart({ rows: allRows }: { rows: ChartRow[] }) {
  // A single bar is a stat tile, not a chart — the prose already states one price better than a
  // one-bar chart would. Render nothing and let the [PRICE:slug] tokens do that job.
  if (allRows.length < 2) return null;

  const ranked = [...allRows].sort((a, b) => a.min - b.min);
  const rows = ranked.slice(0, MAX_BARS);
  const overflow = ranked.length - rows.length;

  const { top, ticks } = niceScale(Math.max(...rows.map((r) => r.max)));
  const plotW = PLOT_R - PLOT_X;
  const x = (v: number) => PLOT_X + (v / top) * plotW;
  const height = TOP + rows.length * ROW_H + 34;

  const summary = rows
    .map((r) => `${r.name}: cheapest ${usd(r.min)}, highest ${usd(r.max)}, across ${r.count} services`)
    .join('. ');

  return (
    <figure style={{ margin: '30px 0', padding: '20px 20px 8px', background: '#fff', border: '1.5px solid oklch(0.92 0.02 260)', borderRadius: 14 }}>
      <svg
        viewBox={`0 0 660 ${height}`}
        role="img"
        aria-label={`Self-pay price ranges. ${summary}.${overflow > 0 ? ` ${overflow} further test${overflow === 1 ? '' : 's'} listed in the table below.` : ''}`}
        style={{ width: '100%', height: 'auto', display: 'block', fontFamily: 'inherit' }}
      >
        {/* Solid hairline gridlines, one shade off the surface — never dashed. */}
        {ticks.map((t) => (
          <line key={t} x1={x(t)} y1={TOP - 6} x2={x(t)} y2={TOP + rows.length * ROW_H - 10} stroke={GRID} strokeWidth="1" />
        ))}

        {rows.map((r, i) => {
          const y = TOP + i * ROW_H;
          const barY = y + (ROW_H - BAR_H) / 2 - 8;
          const minX = x(r.min);
          const maxX = x(r.max);
          // 2px surface gap where the two fills meet, rather than a border between them.
          const tailStart = minX + 2;
          const label = usd(r.min);
          const labelW = label.length * 7.2;
          const outside = minX + 8 + labelW < PLOT_R;

          return (
            <g key={r.slug}>
              <title>{`${r.name}: ${usd(r.min)} to ${usd(r.max)} across ${r.count} ordering services`}</title>
              <text x={NAME_W - 10} y={barY + 13} textAnchor="end" fontSize="12.5" fill={INK}>
                {r.name.length > 30 ? `${r.name.slice(0, 29)}…` : r.name}
              </text>

              {/* The spread above the cheapest price. Drawn first so the solid bar sits over it. */}
              {maxX > tailStart && <rect x={tailStart} y={barY} width={maxX - tailStart} height={BAR_H} rx="4" fill={TAIL} />}
              {/* Square at the zero baseline, rounded at the data end. */}
              <path
                d={`M${PLOT_X} ${barY} H${Math.max(PLOT_X + 4, minX - 4)} a4 4 0 0 1 4 4 v${BAR_H - 8} a4 4 0 0 1 -4 4 H${PLOT_X} Z`}
                fill={SPAN}
              />
              {/* End marker for the cheapest price, with a 2px surface ring. */}
              <circle cx={minX} cy={barY + BAR_H / 2} r="4.5" fill={BEST} stroke="#fff" strokeWidth="2" />

              <text
                x={outside ? minX + 10 : minX - 10}
                y={barY + 13}
                textAnchor={outside ? 'start' : 'end'}
                fontSize="12.5"
                fontWeight="650"
                fill={outside ? INK : '#fff'}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Axis band is inside the viewBox height, so nothing gets clipped. */}
        <line x1={PLOT_X} y1={TOP + rows.length * ROW_H - 10} x2={PLOT_R} y2={TOP + rows.length * ROW_H - 10} stroke={GRID} strokeWidth="1" />
        {ticks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={TOP + rows.length * ROW_H + 8}
            textAnchor="middle"
            fontSize="11.5"
            fill={MUTED}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {`$${Math.round(t)}`}
          </text>
        ))}

        {/* Two fills carrying different meanings, so a legend is always present. */}
        <g>
          <rect x={PLOT_X} y={TOP + rows.length * ROW_H + 18} width="11" height="11" rx="3" fill={SPAN} />
          <text x={PLOT_X + 17} y={TOP + rows.length * ROW_H + 27} fontSize="11.5" fill={MUTED}>
            Cheapest available
          </text>
          <rect x={PLOT_X + 132} y={TOP + rows.length * ROW_H + 18} width="11" height="11" rx="3" fill={TAIL} />
          <text x={PLOT_X + 149} y={TOP + rows.length * ROW_H + 27} fontSize="11.5" fill={MUTED}>
            Up to the highest listing
          </text>
        </g>
      </svg>

      {/* The table view. Every number in the chart is here in text, which is both the accessible
          equivalent and the version a search or answer engine can quote. */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 14 }}>
        <caption style={{ captionSide: 'top', textAlign: 'left', fontSize: 12.5, color: MUTED, paddingBottom: 8 }}>
          Self-pay price range per test, from our own price checks.
          {overflow > 0 && ` The chart above shows the ${MAX_BARS} cheapest; all ${ranked.length} are listed here.`}
        </caption>
        <thead>
          <tr>
            {['Test', 'Cheapest', 'Highest', 'Services'].map((h, i) => (
              <th
                key={h}
                scope="col"
                style={{ textAlign: i === 0 ? 'left' : 'right', padding: '7px 8px', borderBottom: `1.5px solid ${GRID}`, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: MUTED }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => (
            <tr key={r.slug}>
              <th scope="row" style={{ textAlign: 'left', padding: '7px 8px', borderBottom: `1px solid ${GRID}`, fontWeight: 600, color: INK }}>
                <a href={`/test/${r.slug}`} style={{ color: 'oklch(0.48 0.14 260)' }}>
                  {r.name}
                </a>
              </th>
              <td style={{ textAlign: 'right', padding: '7px 8px', borderBottom: `1px solid ${GRID}`, color: INK, fontVariantNumeric: 'tabular-nums' }}>
                {usd(r.min)}
              </td>
              <td style={{ textAlign: 'right', padding: '7px 8px', borderBottom: `1px solid ${GRID}`, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                {usd(r.max)}
              </td>
              <td style={{ textAlign: 'right', padding: '7px 8px', borderBottom: `1px solid ${GRID}`, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                {r.count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
