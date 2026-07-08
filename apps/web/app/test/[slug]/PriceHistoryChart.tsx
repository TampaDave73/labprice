'use client';

// Price-history step chart for the test detail page. Hand-rolled inline SVG on purpose: public
// pages use inline styles (Tailwind arbitrary values are unreliable here — see CLAUDE.md gotcha #1)
// and a chart library is overkill for one step-line chart. PriceHistory records price CHANGES only,
// so each vendor's series is drawn as steps and the last known price extends flat to "today".

export interface HistoryPoint {
  offeringId: string;
  price: number;
  observedAt: string; // ISO
}

interface VendorRef {
  id: string; // offering id
  vendorName: string;
  price: number; // current price — the series' final point, at "now"
}

interface Props {
  offerings: VendorRef[];
  history: HistoryPoint[];
}

// Distinct line colors (hue-spread oklch, consistent with the site palette).
const LINE_COLORS = [
  'oklch(0.55 0.14 230)', // blue
  'oklch(0.55 0.17 145)', // green
  'oklch(0.6 0.16 60)',   // amber
  'oklch(0.55 0.18 300)', // purple
  'oklch(0.58 0.17 20)',  // red
];

const MAX_SERIES = 5;

export default function PriceHistoryChart({ offerings, history }: Props) {
  const now = Date.now();

  // Build one step series per offering: recorded changes + the current price extended to today.
  // Only offerings with at least one recorded change get a line (otherwise it's just a flat dot —
  // noise, not history).
  const byOffering = new Map<string, HistoryPoint[]>();
  for (const p of history) {
    const arr = byOffering.get(p.offeringId) ?? [];
    arr.push(p);
    byOffering.set(p.offeringId, arr);
  }

  const series = offerings
    .filter((o) => (byOffering.get(o.id)?.length ?? 0) >= 1)
    .map((o) => ({
      name: o.vendorName,
      points: [
        ...byOffering.get(o.id)!.map((p) => ({ t: new Date(p.observedAt).getTime(), price: p.price })),
        { t: now, price: o.price },
      ],
    }))
    // Most price movement first — those are the interesting lines when we cap at MAX_SERIES.
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, MAX_SERIES);

  // Nothing to chart yet (new site / stable prices): render nothing at all. The section appears
  // organically once scrapes start recording changes.
  if (series.length === 0) return null;

  // Chart geometry.
  const W = 640;
  const H = 240;
  const PAD = { top: 16, right: 16, bottom: 28, left: 52 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const allPoints = series.flatMap((s) => s.points);
  const tMin = Math.min(...allPoints.map((p) => p.t));
  const tMax = now;
  const pMinRaw = Math.min(...allPoints.map((p) => p.price));
  const pMaxRaw = Math.max(...allPoints.map((p) => p.price));
  // Pad the price range ~10% so lines don't hug the frame; guard the flat-range case.
  const pad = Math.max((pMaxRaw - pMinRaw) * 0.1, pMaxRaw * 0.05, 1);
  const pMin = Math.max(0, pMinRaw - pad);
  const pMax = pMaxRaw + pad;

  const x = (t: number) => PAD.left + (tMax === tMin ? plotW : ((t - tMin) / (tMax - tMin)) * plotW);
  const y = (price: number) => PAD.top + (1 - (price - pMin) / (pMax - pMin)) * plotH;

  // Step path: horizontal to the next change's time, then vertical to the new price.
  const stepPath = (pts: { t: number; price: number }[]) =>
    pts
      .map((p, i) => (i === 0 ? `M ${x(p.t).toFixed(1)} ${y(p.price).toFixed(1)}` : `H ${x(p.t).toFixed(1)} V ${y(p.price).toFixed(1)}`))
      .join(' ');

  const fmtDate = (t: number) =>
    new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const gridPrices = [pMin, (pMin + pMax) / 2, pMax];

  return (
    <div style={{ marginTop: 16, background: '#fff', borderRadius: 14, border: '1.5px solid oklch(0.92 0.02 230)', padding: '16px 18px 12px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.55 0.05 230)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
        Price History
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`Price history chart for ${series.length} ordering service(s)`}>
        {/* horizontal gridlines + $ labels */}
        {gridPrices.map((p, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={y(p)} x2={W - PAD.right} y2={y(p)} stroke="oklch(0.94 0.01 230)" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(p) + 4} textAnchor="end" fontSize="11" fill="oklch(0.55 0.04 230)">
              ${p.toFixed(0)}
            </text>
          </g>
        ))}
        {/* x-axis date labels: start / middle / today */}
        {[tMin, (tMin + tMax) / 2, tMax].map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            fontSize="11"
            fill="oklch(0.55 0.04 230)"
          >
            {i === 2 ? 'Today' : fmtDate(t)}
          </text>
        ))}
        {/* one step line + end dot per vendor */}
        {series.map((s, i) => {
          const color = LINE_COLORS[i % LINE_COLORS.length]!;
          const last = s.points[s.points.length - 1]!;
          return (
            <g key={s.name}>
              <path d={stepPath(s.points)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
              <circle cx={x(last.t)} cy={y(last.price)} r="3.5" fill={color} />
            </g>
          );
        })}
      </svg>
      {/* legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8 }}>
        {series.map((s, i) => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'oklch(0.42 0.03 230)' }}>
            <span style={{ width: 14, height: 3, borderRadius: 2, background: LINE_COLORS[i % LINE_COLORS.length], display: 'inline-block' }} />
            {s.name}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'oklch(0.62 0.03 230)', marginTop: 8, lineHeight: 1.5 }}>
        Lines show recorded price changes over the past year; flat segments mean the price held steady.
      </p>
    </div>
  );
}
