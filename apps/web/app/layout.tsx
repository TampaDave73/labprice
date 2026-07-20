import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import GoogleAnalytics from './components/GoogleAnalytics';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0081b6',
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
        className={`${dmSans.className} min-h-screen antialiased`}
        style={{ background: 'oklch(0.985 0.005 230)' }}
      >
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
