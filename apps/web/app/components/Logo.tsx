// The LabTestCompare mark — test tube (blood fill) overlapped by a magnifying glass with a "$",
// plus the "LabTest"+"Compare"+".com" wordmark. One shared component so the icon geometry and
// colors stay in sync everywhere it appears (Navbar, Footer, AdminSidebar, opengraph-image) instead
// of three independently hand-copied implementations drifting apart — see the 2026-07-22 branding
// handoff (design_handoff_logo_favicon/) for the exact color/geometry spec this replicates.
//
// `variant`: 'light' = navy-stroked icon for a white/light background (Navbar). 'dark' = white-
// stroked icon for a dark background (Footer, AdminSidebar) — the magnifier circle fill also flips
// to navy so it blends into the dark background instead of showing as a white disc, per spec.
const NAVY = '#0f2647';
const BLUE = '#1656e8';
const RED = '#e0293e';
const GREEN = '#1a9e5c';

export function LogoIcon({ variant = 'light', size = 34 }: { variant?: 'light' | 'dark'; size?: number }) {
  const stroke = variant === 'dark' ? '#fff' : NAVY;
  const magnifierFill = variant === 'dark' ? NAVY : '#fff';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path d="M35 12 L35 58 Q35 82 50 82 Q65 82 65 58 L65 12" stroke={stroke} strokeWidth="6" fill="none" strokeLinecap="round" />
      <line x1="30" y1="12" x2="70" y2="12" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
      <path d="M39 40 L39 58 Q39 74 50 74 Q56 74 59 66 L59 40 Z" fill={RED} />
      <circle cx="63" cy="62" r="20" fill={magnifierFill} stroke={stroke} strokeWidth="6.5" />
      <line x1="77" y1="76" x2="91" y2="90" stroke={stroke} strokeWidth="8" strokeLinecap="round" />
      <text x="63" y="70" fontSize="22" fontWeight="700" fill={GREEN} fontFamily="Poppins, sans-serif" textAnchor="middle">$</text>
    </svg>
  );
}

interface LogoProps {
  variant?: 'light' | 'dark';
  iconSize?: number;
  wordmarkSize?: number;
  /** Show the "COMPARE LAB PRICES. SAVE MONEY." tagline under the wordmark (hero placements only). */
  tagline?: boolean;
  className?: string;
}

export default function Logo({ variant = 'light', iconSize = 34, wordmarkSize = 18, tagline = false, className }: LogoProps) {
  const navyText = variant === 'dark' ? '#fff' : NAVY;
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: iconSize >= 60 ? 20 : 10 }}>
      <LogoIcon variant={variant} size={iconSize} />
      <span style={{ display: 'inline-block' }}>
        <span
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: wordmarkSize,
            fontWeight: 800,
            letterSpacing: wordmarkSize > 30 ? -1.5 : -0.3,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: navyText }}>LabTest</span>
          <span style={{ color: BLUE }}>Compare</span>
          <span style={{ color: navyText }}>.com</span>
        </span>
        {tagline && (
          <span
            style={{
              display: 'block',
              marginTop: 10,
              paddingTop: 10,
              borderTop: `1.5px solid ${variant === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(15,38,71,0.15)'}`,
              fontFamily: 'var(--font-brand)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 2.5,
              color: navyText,
              textTransform: 'uppercase',
            }}
          >
            Compare lab prices. Save money.
          </span>
        )}
      </span>
    </span>
  );
}
