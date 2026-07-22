// Dynamically-generated social share card (og:image / twitter:image). Next serves this for every
// page that doesn't provide its own, so links to the site render a branded preview instead of the
// blank/missing static PNG the metadata used to point at. Generated at the edge — no binary asset.
// Icon geometry/colors match the 2026-07-22 branding handoff (same shape as app/icon.svg and
// components/Logo.tsx's <LogoIcon/>) — Satori (ImageResponse's renderer) supports plain SVG shapes
// inline, so this is the same paths, not a re-approximation.
import { ImageResponse } from 'next/og';

export const alt = 'LabTestCompare — Compare Blood Test Prices';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#0f2647',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 36 }}>
          <svg width="84" height="84" viewBox="0 0 100 100" fill="none">
            <path d="M35 12 L35 58 Q35 82 50 82 Q65 82 65 58 L65 12" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" />
            <line x1="30" y1="12" x2="70" y2="12" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
            <path d="M39 40 L39 58 Q39 74 50 74 Q56 74 59 66 L59 40 Z" fill="#e0293e" />
            <circle cx="63" cy="62" r="20" fill="#0f2647" stroke="#fff" strokeWidth="6.5" />
            <line x1="77" y1="76" x2="91" y2="90" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
            <text x="63" y="70" fontSize="22" fontWeight="700" fill="#1a9e5c" textAnchor="middle">$</text>
          </svg>
          <div style={{ display: 'flex', fontSize: 48, fontWeight: 800, letterSpacing: '-1.5px' }}>
            <span style={{ color: '#fff' }}>LabTest</span>
            <span style={{ color: '#1656e8' }}>Compare</span>
            <span style={{ color: '#fff' }}>.com</span>
          </div>
        </div>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-2px', maxWidth: 900 }}>
          Compare blood test prices
        </div>
        <div style={{ fontSize: 32, marginTop: 24, color: 'rgba(255,255,255,0.85)', maxWidth: 880 }}>
          Self-pay prices across ordering services — find the cheapest lab test near you.
        </div>
      </div>
    ),
    { ...size },
  );
}
