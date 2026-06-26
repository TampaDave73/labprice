import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#3b1f8e',
};

export const metadata: Metadata = {
  title: {
    default: 'LabPrice — Compare Blood Test Prices',
    template: '%s | LabPrice',
  },
  description: 'Compare self-pay blood test prices across ordering services. Find the cheapest Vitamin D, Testosterone, CBC, and more.',
  keywords: ['blood test prices', 'lab test comparison', 'self-pay lab tests', 'cheap blood tests'],
  openGraph: {
    title: 'LabPrice — Compare Blood Test Prices',
    description: 'Compare self-pay blood test prices across ordering services. Find the cheapest lab tests.',
    url: 'https://labprice.com',
    siteName: 'LabPrice',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'LabPrice' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LabPrice — Compare Blood Test Prices',
    description: 'Compare self-pay blood test prices across ordering services.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans bg-brand-50 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
