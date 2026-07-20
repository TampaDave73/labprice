'use client';

// Price-range chart for the test detail page. Hand-rolled inline SVG on purpose: public pages use
// inline styles (Tailwind arbitrary values are unreliable here — see CLAUDE.md gotcha #1) and a
// chart library is overkill for one chart. Rather than one line per vendor (unreadable past a
// handful, and capped/sorted arbitrarily), this draws a single shaded band: the low-to-high price
// spread across ALL vendors, stepping whenever any vendor's price changes.

export interface HistoryPoint {
  offeringId: string;
  price: number;
  observedAt: string; // ISO
}

interface VendorRef {
  id: string; // offering id
  vendorName: string;
  price: number; // current price
}

interface Props {
  offerings: VendorRef[];
  history: HistoryPoint[];
}

export default function PriceHistoryChart({ offerings, history }: Props) {
  // Nothing to chart yet (new site / no recorded changes): render nothing. The section appears
  // organically once scrapes start recording changes.
  if (history.length === 0 || offerings.length === 0) return null;

  const now = Date.now();
  const tMin = Math.min(...history.map((p) => new Date(p.observedAt).getTime()));

  const byOffering = new Map<string, HistoryPoint[]>();
  for (const p of history) {
    const arr = byOffering.get(p.offeringId) ?? [];
    arr.push(p);
    byOffering.set(p.offeringId, arr);
  }

  // One step series per vendor, all starting at tMin and extended to "now" at the current price.
  // PriceHistory records CHANGES only: a vendor with no recorded change is treated as flat at its
  // current price for the whole window, and a vendor whose first recorded change happens after
  // tMin has that price backfilled to tMin too — we don't track "vendor first listed" separately,
  // so the true pre-change price is unknown and the closest known value is the least-bad estimate.
  // Every series is defined over [tMin, now] on purpose, so low/high can be computed at any time.
  const series = offerings.map((o) => {
    const changes = (byOffering.get(o.id) ?? [])
      .map((p) => ({ t: new Date(p.observedAt).getTime(), price: p.price }))
      .sort((a, b) => a.t - b.t);
    const points =
      changes.length === 0
        ? [{ t: tMin, price: o.price }]
        : changes[0]!.t > tMin
          ? [{ t: tMin, price: changes[0]!.price }, ...changes]
          : changes;
    return [...points, { t: now, price: o.price }];
  });

  const allTimes = Array.from(new Set(series.flatMap((s) => s.map((p) => p.t)))).sort((a, b) => a - b);

  // Carry-forward lookup: a vendor's price as of time t (last recorded point at or before t).
  const priceAt = (points: { t: number; price: number }[], t: number) => {
    let val = points[0]!.price;
    for (const p of points) {
      if (p.t > t) break;
      val = p.price;
    }
    return val;
  };

  const low = allTimes.map((t) => Math.min(...series.map((s) => priceAt(s, t))));
  const high = allTimes.map((t) => Math.max(...series.map((s) => priceAt(s, t))));

  // Chart geometry.
  const W = 640;
  const H = 220;
  const PAD = { top: 16, right: 16, bottom: 28, left: 52 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const pMinRaw = Math.min(...low);
  const pMaxRaw = Math.max(...high);
  // Pad the price range ~10% so the band doesn't hug the frame; guard the flat-range case.
  const pad = Math.max((pMaxRaw - pMinRaw) * 0.1, pMaxRaw * 0.05, 1);
  const pMin = Math.max(0, pMinRaw - pad);
  const pMax = pMaxRaw + pad;

  const x = (t: number) => PAD.left + (now === tMin ? plotW : ((t - tMin) / (now - tMin)) * plotW);
  const y = (price: number) => PAD.top + (1 - (price - pMin) / (pMax - pMin)) * plotH;

  // Step-boundary vertices, left to right: hold the old value up to the new time, then jump.
  const stepVertices = (values: number[]): [number, number][] => {
    const verts: [number, number][] = [];
    allTimes.forEach((t, i) => {
      const xi = x(t);
      if (i === 0) {
        verts.push([xi, y(values[i]!)]);
      } else {
        verts.push([xi, y(values[i - 1]!)]);
        verts.push([xi, y(values[i]!)]);
      }
    });
    return verts;
  };

  const toPath = (verts: [number, number][]) =>
    `M ${verts.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join(' L ')}`;

  const topVerts = stepVertices(high);
  const bottomVerts = stepVertices(low);
  // Fill polygon: trace the high band left-to-right, then the low band right-to-left, and close.
  const bandPath = `${toPath(topVerts)} L ${[...bottomVerts]
    .reverse()
    .map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`)
    .join(' L ')} Z`;

  const fmtDate = (t: number) =>
    new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const gridPrices = [pMin, (pMin + pMax) / 2, pMax];

  const todayLow = low[low.length - 1]!;
  const todayHigh = high[high.length - 1]!;

  return (
    <div style={{ marginTop: 16, background: '#fff', borderRadius: 14, border: '1.5px solid oklch(0.92 0.02 230)', padding: '16px 18px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.55 0.05 230)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          Price Range
        </div>
        <div style={{ fontSize: 12, color: 'oklch(0.5 0.04 230)' }}>
          Today: <strong style={{ color: 'oklch(0.3 0.08 230)' }}>${todayLow.toFixed(2)}&ndash;${todayHigh.toFixed(2)}</strong>
          {todayHigh > todayLow && (
            <span style={{ color: 'oklch(0.62 0.03 230)' }}> &middot; ${(todayHigh - todayLow).toFixed(2)} spread</span>
          )}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`Price range across ${offerings.length} ordering service(s) over time`}>
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
        {[tMin, (tMin + now) / 2, now].map((t, i) => (
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
        {/* shaded low-high band + top/bottom boundary lines */}
        <path d={bandPath} fill="oklch(0.58 0.14 230 / 0.16)" stroke="none" />
        <path d={toPath(topVerts)} fill="none" stroke="oklch(0.55 0.16 20)" strokeWidth="1.75" strokeLinejoin="round" />
        <path d={toPath(bottomVerts)} fill="none" stroke="oklch(0.55 0.15 145)" strokeWidth="1.75" strokeLinejoin="round" />
      </svg>
      {/* legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'oklch(0.42 0.03 230)' }}>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: 'oklch(0.55 0.16 20)', display: 'inline-block' }} />
          Highest listed price
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'oklch(0.42 0.03 230)' }}>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: 'oklch(0.55 0.15 145)', display: 'inline-block' }} />
          Lowest listed price
        </span>
      </div>
      <p style={{ fontSize: 11, color: 'oklch(0.62 0.03 230)', marginTop: 8, lineHeight: 1.5 }}>
        Shaded band shows the spread between the lowest and highest listed price across all vendors, over the past year.
      </p>
    </div>
  );
}
