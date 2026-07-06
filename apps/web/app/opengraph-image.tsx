// Dynamically-generated social share card (og:image / twitter:image). Next serves this for every
// page that doesn't provide its own, so links to the site render a branded preview instead of the
// blank/missing static PNG the metadata used to point at. Generated at the edge — no binary asset.
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
          background: 'linear-gradient(135deg, #0a2540 0%, #0081b6 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
            }}
          >
            🩸
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-1px' }}>LabTestCompare</div>
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
