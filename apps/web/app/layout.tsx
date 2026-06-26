import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'LabPrice — Compare Blood Test Prices',
    template: '%s | LabPrice',
  },
  description: 'Compare self-pay blood test prices across ordering services. Find the cheapest Vitamin D, Testosterone, CBC, and more.',
  keywords: ['blood test prices', 'lab test comparison', 'self-pay lab tests', 'cheap blood tests'],
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
