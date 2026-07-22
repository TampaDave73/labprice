// One-off generator for the raster icon assets Next.js's file-based icon convention needs (SVG
// favicons work everywhere modern; apple-touch-icon and the larger PWA/app icon still need PNG).
// Source geometry/colors are the 2026-07-22 branding handoff (design_handoff_logo_favicon/) — same
// paths as apps/web/app/icon.svg and apps/web/app/components/Logo.tsx's <LogoIcon/>, kept in sync by
// hand since there's only the one shape. Re-run with `pnpm exec tsx scripts/generate-brand-icons.ts`
// from apps/web whenever the mark changes.
import sharp from 'sharp';
import { join } from 'path';

const markOnWhite = (size: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
<rect x="2" y="2" width="96" height="96" rx="22" fill="#ffffff"/>
<path d="M35 12 L35 58 Q35 82 50 82 Q65 82 65 58 L65 12" stroke="#0f2647" stroke-width="6" fill="none" stroke-linecap="round"/>
<line x1="30" y1="12" x2="70" y2="12" stroke="#0f2647" stroke-width="6" stroke-linecap="round"/>
<path d="M39 40 L39 58 Q39 74 50 74 Q56 74 59 66 L59 40 Z" fill="#e0293e"/>
<circle cx="63" cy="62" r="20" fill="#fff" stroke="#0f2647" stroke-width="6.5"/>
<line x1="77" y1="76" x2="91" y2="90" stroke="#0f2647" stroke-width="8" stroke-linecap="round"/>
<text x="63" y="70" font-size="22" font-weight="700" fill="#1a9e5c" font-family="Poppins, sans-serif" text-anchor="middle">$</text>
</svg>`;

const markOnNavy = (size: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
<rect x="2" y="2" width="96" height="96" rx="22" fill="#0f2647"/>
<path d="M35 12 L35 58 Q35 82 50 82 Q65 82 65 58 L65 12" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>
<line x1="30" y1="12" x2="70" y2="12" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
<path d="M39 40 L39 58 Q39 74 50 74 Q56 74 59 66 L59 40 Z" fill="#e0293e"/>
<circle cx="63" cy="62" r="20" fill="#0f2647" stroke="#fff" stroke-width="6.5"/>
<line x1="77" y1="76" x2="91" y2="90" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
<text x="63" y="70" font-size="22" font-weight="700" fill="#1a9e5c" font-family="Poppins, sans-serif" text-anchor="middle">$</text>
</svg>`;

async function render(svg: string, outPath: string, size: number) {
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log('wrote', outPath);
}

async function main() {
  const appDir = join(__dirname, '..', 'app');
  const publicDir = join(__dirname, '..', 'public');

  // apple-touch-icon: Next.js special file, white background per spec (iOS doesn't handle
  // transparency well on home-screen icons).
  await render(markOnWhite(180), join(appDir, 'apple-icon.png'), 180);

  // Larger app icon (navy background, per spec's "App icon" variant) for a future PWA manifest —
  // not wired into metadata yet since this site isn't a PWA today, but here if that changes.
  await render(markOnNavy(512), join(publicDir, 'icon-512.png'), 512);
}

main().catch((err) => { console.error(err); process.exit(1); });
