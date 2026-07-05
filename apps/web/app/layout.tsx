import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
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
  title: {
    default: 'LabTestCompare — Compare Blood Test Prices',
    template: '%s | LabTestCompare',
  },
  description: 'Compare self-pay blood test prices across ordering services. Find the cheapest Vitamin D, Testosterone, CBC, and more.',
  keywords: ['blood test prices', 'lab test comparison', 'self-pay lab tests', 'cheap blood tests'],
  openGraph: {
    title: 'LabTestCompare — Compare Blood Test Prices',
    description: 'Compare self-pay blood test prices across ordering services. Find the cheapest lab tests.',
    url: 'https://labtestcompare.com',
    siteName: 'LabTestCompare',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'LabTestCompare' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LabTestCompare — Compare Blood Test Prices',
    description: 'Compare self-pay blood test prices across ordering services.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.className} min-h-screen antialiased`}
        style={{ background: 'oklch(0.97 0.01 230)' }}
      >
        {children}
      </body>
    </html>
  );
}
