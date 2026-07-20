'use client';

// Daily traffic trend — page views + unique visitors on one axis (both are counts of the same
// magnitude, so this never becomes the dual-axis mistake). Hand-rolled SVG (no charting lib in this
// repo) per the dataviz skill: 2px round-cap lines, hairline gridlines, a legend (2 series), a
// pointer-tracked crosshair + one tooltip listing every series, and end-value labels.
import { useMemo, useRef, useState } from 'react';

export interface DailyPoint {
  date: string; // 'YYYY-MM-DD'
  pageViews: number;
  uniqueSessions: number;
}

// Validated pair (dataviz skill categorical slots 1+2): worst adjacent ΔE 26.5 CVD / 29.0 normal-vision.
const SERIES = {
  views: { key: 'pageViews' as const, label: 'Page views', color: '#2a78d6' },
  sessions: { key: 'uniqueSessions' as const, label: 'Unique visitors', color: '#008300' },
};
const MUTED = '#898781';
const GRID = '#e1e0d9';
const INK_SECONDARY = '#52514e';
const SURFACE = '#fcfcfb';

const W = 720;
const H = 220;
const PAD = { top: 14, right: 12, bottom: 26, left: 40 };

function niceMax(n: number): number {
  if (n <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(n));
  const steps = [1, 2, 2.5, 5, 10];
  for (const s of steps) {
    if (n <= s * magnitude) return s * magnitude;
  }
  return 10 * magnitude;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function TrafficChart({ daily }: { daily: DailyPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const n = daily.length;

  const yMax = useMemo(
    () => niceMax(Math.max(1, ...daily.map((d) => Math.max(d.pageViews, d.uniqueSessions)))),
    [daily],
  );

  const xAt = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  const linePath = (key: 'pageViews' | 'uniqueSessions') =>
    daily.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(d[key]).toFixed(1)}`).join(' ');

  // ~6 evenly spaced x-axis ticks regardless of window length (7/30/90 days).
  const tickCount = Math.min(6, n);
  const tickIdxs = Array.from({ length: tickCount }, (_, i) => Math.round((i / Math.max(1, tickCount - 1)) * (n - 1)));
  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const xInSvg = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (xInSvg - PAD.left) / plotW;
    const idx = Math.round(frac * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
  }

  const hover = hoverIdx != null ? daily[hoverIdx] : null;
  // Clamp tooltip so it never overflows the right edge of the chart.
  const tooltipLeftPct = hoverIdx != null ? Math.min(78, Math.max(0, (xAt(hoverIdx) / W) * 100)) : 0;

  return (
    <div className="relative">
      {/* Legend — line keys, not filled boxes (dataviz skill: tooltip density note applies to the
          legend here too since a full box would out-weight the thin lines it labels). */}
      <div className="mb-2 flex items-center gap-4 text-xs text-brand-500">
        {Object.values(SERIES).map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block', overflow: 'visible' }}>
        {/* Gridlines (hairline, recessive) + y labels */}
        {gridlines.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yAt(v)} y2={yAt(v)} stroke={GRID} strokeWidth={1} />
            <text x={PAD.left - 8} y={yAt(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={MUTED}>
              {v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : Math.round(v)}
            </text>
          </g>
        ))}

        {/* X-axis ticks */}
        {tickIdxs.map((i) => (
          <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={MUTED}>
            {daily[i] ? formatDate(daily[i]!.date) : ''}
          </text>
        ))}

        {/* Series lines */}
        <path d={linePath('pageViews')} fill="none" stroke={SERIES.views.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath('uniqueSessions')} fill="none" stroke={SERIES.sessions.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* End-value labels (line → value at the end) */}
        {n > 0 && (
          <>
            <text x={xAt(n - 1) + 6} y={yAt(daily[n - 1]!.pageViews)} fontSize={11} fontWeight={600} fill={SERIES.views.color} dominantBaseline="middle">
              {daily[n - 1]!.pageViews.toLocaleString()}
            </text>
            <text x={xAt(n - 1) + 6} y={yAt(daily[n - 1]!.uniqueSessions)} fontSize={11} fontWeight={600} fill={SERIES.sessions.color} dominantBaseline="middle">
              {daily[n - 1]!.uniqueSessions.toLocaleString()}
            </text>
          </>
        )}

        {/* Crosshair + hover dots (surface ring so they stay legible crossing the line) */}
        {hover && hoverIdx != null && (
          <g>
            <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={PAD.top} y2={H - PAD.bottom} stroke={INK_SECONDARY} strokeWidth={1} strokeOpacity={0.35} />
            {(['pageViews', 'uniqueSessions'] as const).map((key) => (
              <circle
                key={key}
                cx={xAt(hoverIdx)}
                cy={yAt(hover[key])}
                r={4}
                fill={key === 'pageViews' ? SERIES.views.color : SERIES.sessions.color}
                stroke={SURFACE}
                strokeWidth={2}
              />
            ))}
          </g>
        )}

        {/* Hit layer — full plot width/height, tracks nearest day (bigger than the 2px line itself) */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIdx(null)}
        />
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute top-1 rounded-lg border border-brand-100 bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: `${tooltipLeftPct}%` }}
        >
          <div className="mb-1 font-semibold text-brand-900">{formatDate(hover.date)}</div>
          <div className="flex items-center gap-1.5 text-brand-600">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: SERIES.views.color }} />
            <span className="font-semibold text-brand-900">{hover.pageViews.toLocaleString()}</span> page views
          </div>
          <div className="flex items-center gap-1.5 text-brand-600">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: SERIES.sessions.color }} />
            <span className="font-semibold text-brand-900">{hover.uniqueSessions.toLocaleString()}</span> unique visitors
          </div>
        </div>
      )}
    </div>
  );
}
