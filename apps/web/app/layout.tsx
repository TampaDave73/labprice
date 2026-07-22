import type { Metadata, Viewport } from 'next';
import { DM_Sans, Poppins } from 'next/font/google';
import GoogleAnalytics from './components/GoogleAnalytics';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

// Brand wordmark font (2026-07-22 branding handoff) — self-hosted via next/font, scoped to
// `--font-poppins` and bridged into globals.css's `--font-brand` custom property so `<Logo/>` (and
// only the logo, deliberately — body copy stays DM Sans) picks it up without an extra Google Fonts
// network request.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-poppins',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f2647',
};

export const metadata: Metadata = {
  // Absolute base for OG/canonical URLs; also lets the generated opengraph-image resolve.
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com'),
  title: {
    default: 'LabTestCompare — Compare Blood Test Prices',
    template: '%s | LabTestCompare',
  },
  description: 'Compare self-pay blood test prices across ordering services. Find the cheapest Vitamin D, Testosterone, CBC, and more.',
  keywords: ['blood test prices', 'lab test comparison', 'self-pay lab tests', 'cheap blood tests'],
  // No `images` here on purpose — the generated app/opengraph-image.tsx card is picked up
  // automatically for og:image and twitter:image (and per-page routes can still override it).
  openGraph: {
    title: 'LabTestCompare — Compare Blood Test Prices',
    description: 'Compare self-pay blood test prices across ordering services. Find the cheapest lab tests.',
    url: 'https://labtestcompare.com',
    siteName: 'LabTestCompare',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LabTestCompare — Compare Blood Test Prices',
    description: 'Compare self-pay blood test prices across ordering services.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.className} ${poppins.variable} min-h-screen antialiased`}
        style={{ background: 'oklch(0.985 0.005 260)' }}
      >
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
