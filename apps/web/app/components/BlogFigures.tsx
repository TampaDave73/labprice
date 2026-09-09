// Diagrams for blog articles, referenced from a post body as `[FIG:name]` (see BlogBody.tsx).
//
// Inline SVG rather than images on purpose: the labels stay real text, so the diagram's content is
// readable by search and answer engines instead of being locked inside a bitmap — which is the whole
// point of putting a figure in an article written to be quoted. They also cost nothing to serve and
// stay sharp at any zoom.
//
// Each figure is authored on a fixed viewBox and scales to its container width. Keep the palette in
// sync with the public pages (inline styles, not Tailwind — see CLAUDE.md gotcha 1).

const INK = 'oklch(0.2 0.04 260)';
const MUTED = 'oklch(0.52 0.04 260)';
const FAINT = 'oklch(0.62 0.03 260)';
const LINE = 'oklch(0.87 0.025 260)';
const ACCENT = 'oklch(0.55 0.14 260)';
const ACCENT_SOFT = 'oklch(0.95 0.035 260)';
const GREEN = 'oklch(0.52 0.15 155)';
const GREEN_SOFT = 'oklch(0.95 0.045 155)';
const AMBER = 'oklch(0.62 0.14 75)';
const AMBER_SOFT = 'oklch(0.96 0.05 75)';
const RED = 'oklch(0.58 0.16 25)';
const RED_SOFT = 'oklch(0.96 0.04 25)';

// Shared <svg> props. `fontFamily: inherit` picks up the page's DM Sans instead of the browser's
// SVG default serif; the viewBox + width:100% pair is what makes these responsive.
function svgProps(viewBox: string) {
  return {
    viewBox,
    role: 'img' as const,
    style: { width: '100%', height: 'auto', display: 'block', fontFamily: 'inherit' },
  };
}

/** Order → requisition → draw → result. The path a self-pay test actually takes. */
function DrawSteps() {
  const steps = [
    { n: '1', t: 'Order online', s: 'Pay the ordering\nservice' },
    { n: '2', t: 'Get requisition', s: 'Emailed, usually\nin minutes' },
    { n: '3', t: 'Visit the lab', s: 'A Quest or LabCorp\npatient service centre' },
    { n: '4', t: 'Blood drawn', s: 'One to a few tubes,\nabout 5 minutes' },
    { n: '5', t: 'Results', s: 'Back to you, often\nin 1–3 days' },
  ];
  const x0 = 62;
  const gap = 124;

  return (
    <svg {...svgProps('0 0 660 190')} aria-label="The five steps of a self-pay blood test: order online, receive a requisition by email, visit a Quest or LabCorp patient service centre, have blood drawn in about five minutes, and receive results in one to three days.">
      <line x1={x0} y1={46} x2={x0 + gap * 4} y2={46} stroke={LINE} strokeWidth="2" />
      {steps.map((s, i) => {
        const cx = x0 + gap * i;
        return (
          <g key={s.n}>
            <circle cx={cx} cy={46} r="21" fill={i === 3 ? ACCENT : ACCENT_SOFT} stroke={ACCENT} strokeWidth="1.5" />
            <text x={cx} y={52} textAnchor="middle" fontSize="16" fontWeight="700" fill={i === 3 ? '#fff' : ACCENT}>
              {s.n}
            </text>
            <text x={cx} y={92} textAnchor="middle" fontSize="13.5" fontWeight="650" fill={INK}>
              {s.t}
            </text>
            {s.s.split('\n').map((line, j) => (
              <text key={j} x={cx} y={112 + j * 15} textAnchor="middle" fontSize="11.5" fill={MUTED}>
                {line}
              </text>
            ))}
          </g>
        );
      })}
      <rect x={x0 - 52} y={152} width={gap * 4 + 104} height="30" rx="8" fill={GREEN_SOFT} />
      <text x={x0 + gap * 2} y={171} textAnchor="middle" fontSize="12" fill={GREEN} fontWeight="600">
        The draw itself is identical no matter which service you ordered through.
      </text>
    </svg>
  );
}

/** What "fasting" actually means, on a clock. */
function FastingClock() {
  const bar = { x: 60, y: 66, w: 540, h: 26 };
  const marks = [
    { at: 0, label: '8pm', sub: 'Last meal' },
    { at: 0.5, label: 'overnight', sub: 'Water only' },
    { at: 1, label: '8am', sub: 'Blood draw' },
  ];

  return (
    <svg {...svgProps('0 0 660 210')} aria-label="A fasting timeline: last meal at 8pm, water only overnight, blood draw at 8am twelve hours later. Plain water, prescription medication and black coffee without milk or sugar are generally acceptable; food, juice, milk, sweetened drinks and alcohol are not.">
      <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx="13" fill={ACCENT_SOFT} />
      <text x={bar.x + bar.w / 2} y={bar.y + 18} textAnchor="middle" fontSize="12.5" fontWeight="600" fill={ACCENT}>
        12 hours, nothing but water
      </text>
      {marks.map((m) => {
        const cx = bar.x + bar.w * m.at;
        const anchor = m.at === 0 ? 'start' : m.at === 1 ? 'end' : 'middle';
        const tx = m.at === 0 ? cx : m.at === 1 ? cx : cx;
        return (
          <g key={m.label}>
            {m.at !== 0.5 && <line x1={cx} y1={bar.y - 14} x2={cx} y2={bar.y + bar.h + 14} stroke={ACCENT} strokeWidth="2" />}
            <text x={tx} y={bar.y - 22} textAnchor={anchor} fontSize="13" fontWeight="700" fill={INK}>
              {m.at === 0.5 ? '' : m.label}
            </text>
            <text x={tx} y={bar.y + bar.h + 32} textAnchor={anchor} fontSize="12" fill={MUTED}>
              {m.at === 0.5 ? '' : m.sub}
            </text>
          </g>
        );
      })}

      <g>
        <rect x="60" y="140" width="255" height="52" rx="10" fill={GREEN_SOFT} />
        <text x="76" y="161" fontSize="12" fontWeight="700" fill={GREEN}>
          Generally fine
        </text>
        <text x="76" y="180" fontSize="12" fill={MUTED}>
          Water · prescription medication · black coffee
        </text>
      </g>
      <g>
        <rect x="345" y="140" width="255" height="52" rx="10" fill={RED_SOFT} />
        <text x="361" y="161" fontSize="12" fontWeight="700" fill={RED}>
          Breaks the fast
        </text>
        <text x="361" y="180" fontSize="12" fill={MUTED}>
          Food · juice · milk · sweetened drinks · alcohol
        </text>
      </g>
    </svg>
  );
}

/** The four numbers on a lipid panel, and how they relate. */
function LipidBreakdown() {
  const rows = [
    { name: 'LDL cholesterol', note: 'Carries cholesterol into artery walls', w: 0.52, color: RED, soft: RED_SOFT },
    { name: 'HDL cholesterol', note: 'Carries it back out to the liver', w: 0.24, color: GREEN, soft: GREEN_SOFT },
    { name: 'Triglycerides', note: 'Circulating fat, strongly diet-linked', w: 0.24, color: AMBER, soft: AMBER_SOFT },
  ];
  const barX = 250;
  const barW = 350;

  return (
    <svg {...svgProps('0 0 660 235')} aria-label="A lipid panel reports total cholesterol, which is made up of LDL cholesterol, HDL cholesterol and triglycerides. LDL carries cholesterol into artery walls, HDL carries it back to the liver, and triglycerides are circulating fat.">
      <rect x={barX} y="20" width={barW} height="34" rx="9" fill={ACCENT_SOFT} stroke={ACCENT} strokeWidth="1.5" />
      <text x={barX + barW / 2} y="42" textAnchor="middle" fontSize="13.5" fontWeight="700" fill={ACCENT}>
        Total cholesterol
      </text>
      <text x={barX - 14} y="42" textAnchor="end" fontSize="12.5" fill={MUTED}>
        One draw reports:
      </text>

      {rows.map((r, i) => {
        const y = 86 + i * 48;
        return (
          <g key={r.name}>
            <line x1={barX + 18} y1="60" x2={barX + 18} y2={y + 17} stroke={LINE} strokeWidth="1.5" />
            <line x1={barX + 18} y1={y + 17} x2={barX + 30} y2={y + 17} stroke={LINE} strokeWidth="1.5" />
            <rect x={barX + 30} y={y} width={barW * r.w} height="34" rx="8" fill={r.soft} stroke={r.color} strokeWidth="1.2" />
            <text x={barX + 44} y={y + 22} fontSize="12.5" fontWeight="650" fill={r.color}>
              {r.name}
            </text>
            <text x={barX - 14} y={y + 22} textAnchor="end" fontSize="11.5" fill={FAINT}>
              {r.note}
            </text>
          </g>
        );
      })}
      <text x={barX + 30} y="228" fontSize="11.5" fill={FAINT}>
        Widths are illustrative, not a reference range — your lab reports the actual numbers.
      </text>
    </svg>
  );
}

/** The CMP's 14 analytes, grouped by what they are actually telling you about. */
function CmpGroups() {
  const groups = [
    { title: 'Kidneys', items: ['BUN', 'Creatinine', 'eGFR'], color: ACCENT, soft: ACCENT_SOFT },
    { title: 'Liver', items: ['ALT', 'AST', 'ALP', 'Bilirubin'], color: AMBER, soft: AMBER_SOFT },
    { title: 'Electrolytes & fluid', items: ['Sodium', 'Potassium', 'Chloride', 'CO₂', 'Calcium'], color: GREEN, soft: GREEN_SOFT },
    { title: 'Sugar & protein', items: ['Glucose', 'Albumin', 'Total protein'], color: 'oklch(0.5 0.16 300)', soft: 'oklch(0.95 0.04 300)' },
  ];
  const colW = 152;
  const x0 = 22;

  return (
    <svg {...svgProps('0 0 660 250')} aria-label="A comprehensive metabolic panel groups fourteen measurements: kidney markers (BUN, creatinine, eGFR); liver markers (ALT, AST, ALP, bilirubin); electrolytes and fluid balance (sodium, potassium, chloride, carbon dioxide, calcium); and sugar and protein (glucose, albumin, total protein).">
      {groups.map((g, i) => {
        const x = x0 + i * (colW + 8);
        return (
          <g key={g.title}>
            <rect x={x} y="18" width={colW} height="212" rx="12" fill={g.soft} />
            <rect x={x} y="18" width={colW} height="34" rx="12" fill={g.color} />
            <rect x={x} y="40" width={colW} height="12" fill={g.color} />
            <text x={x + colW / 2} y="40" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#fff">
              {g.title}
            </text>
            {g.items.map((it, j) => (
              <g key={it}>
                <rect x={x + 14} y={68 + j * 30} width={colW - 28} height="23" rx="6" fill="#fff" />
                <text x={x + colW / 2} y={84 + j * 30} textAnchor="middle" fontSize="12" fill={INK}>
                  {it}
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** Why the same test has two completely different prices. */
function SelfPayVsInsurance() {
  return (
    <svg {...svgProps('0 0 660 240')} aria-label="Two routes to the same blood test. The insurance route runs from doctor's visit to insurer negotiation to a deductible and an explanatory benefits statement, with the cost unknown until afterwards. The self-pay route runs from ordering online to a fixed published price paid up front, with the same draw and the same laboratory at the end.">
      <g>
        <rect x="18" y="18" width="300" height="96" rx="12" fill="oklch(0.97 0.01 260)" stroke={LINE} strokeWidth="1.5" />
        <text x="36" y="44" fontSize="13" fontWeight="700" fill={MUTED}>
          Through insurance
        </text>
        {['Doctor visit → order', 'Insurer-negotiated rate', 'Deductible, then a statement'].map((t, i) => (
          <text key={t} x="36" y={66 + i * 18} fontSize="11.5" fill={FAINT}>
            {t}
          </text>
        ))}
        <rect x="18" y="122" width="300" height="30" rx="8" fill={AMBER_SOFT} />
        <text x="36" y="142" fontSize="12" fontWeight="600" fill={AMBER}>
          Price known only afterwards
        </text>
      </g>

      <g>
        <rect x="342" y="18" width="300" height="96" rx="12" fill={ACCENT_SOFT} stroke={ACCENT} strokeWidth="1.5" />
        <text x="360" y="44" fontSize="13" fontWeight="700" fill={ACCENT}>
          Self-pay
        </text>
        {['Order online, no visit', 'Published, fixed price', 'Paid up front'].map((t, i) => (
          <text key={t} x="360" y={66 + i * 18} fontSize="11.5" fill={MUTED}>
            {t}
          </text>
        ))}
        <rect x="342" y="122" width="300" height="30" rx="8" fill={GREEN_SOFT} />
        <text x="360" y="142" fontSize="12" fontWeight="600" fill={GREEN}>
          Price known before you buy
        </text>
      </g>

      <path d="M168 160 L168 182 L330 182 L330 196" stroke={LINE} strokeWidth="1.8" fill="none" />
      <path d="M492 160 L492 182 L330 182 L330 196" stroke={LINE} strokeWidth="1.8" fill="none" />
      <rect x="180" y="196" width="300" height="34" rx="10" fill={INK} />
      <text x="330" y="218" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="#fff">
        Same draw, same lab, same result
      </text>
    </svg>
  );
}

const FIGURES: Record<string, { Component: () => React.JSX.Element; caption: string }> = {
  'draw-steps': { Component: DrawSteps, caption: 'What actually happens between paying for a test and getting a result.' },
  'fasting-clock': { Component: FastingClock, caption: 'A 12-hour fast, and what does and does not break it.' },
  'lipid-breakdown': { Component: LipidBreakdown, caption: 'The numbers a single lipid panel reports.' },
  'cmp-groups': { Component: CmpGroups, caption: 'The CMP’s 14 measurements, grouped by what they describe.' },
  'selfpay-vs-insurance': { Component: SelfPayVsInsurance, caption: 'Two routes to an identical blood draw.' },
};

export function hasFigure(name: string): boolean {
  return name in FIGURES;
}

/** Renders one named figure as a captioned <figure>. Unknown names render nothing (never a crash —
 *  post bodies are admin-editable, so a typo must degrade quietly). */
export default function BlogFigure({ name }: { name: string }) {
  const fig = FIGURES[name];
  if (!fig) return null;
  const { Component, caption } = fig;
  return (
    <figure style={{ margin: '30px 0', padding: '22px 20px 16px', background: '#fff', border: '1.5px solid oklch(0.92 0.02 260)', borderRadius: 14 }}>
      <Component />
      <figcaption style={{ marginTop: 14, fontSize: 12.5, color: 'oklch(0.55 0.03 260)', textAlign: 'center' }}>
        {caption}
      </figcaption>
    </figure>
  );
}
