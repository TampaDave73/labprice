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

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://labtestcompare.com';

// Site-wide entity. Answer engines resolve "what is LabTestCompare" from Organization; the
// WebSite/SearchAction node is what lets them address /search directly instead of guessing a URL
// shape. Emitted once in the root layout so every route carries it — per-page JSON-LD (test pages,
// articles) is additive, not a replacement.
//
// Two separate blocks rather than one `@graph`: a @graph wrapper has no top-level `@type`, and
// validators flag that as a schema missing its type. `@id` cross-references still resolve across
// separate script tags, so nothing is lost by splitting them.
const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${BASE_URL}/#organization`,
  name: 'LabTestCompare',
  url: BASE_URL,
  logo: `${BASE_URL}/icon-512.png`,
  description:
    'Independent price comparison for self-pay blood tests ordered through services that draw at Quest Diagnostics and LabCorp patient service centers.',
  email: 'hello@labtestcompare.com',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '217 Hobbs St #107',
    addressLocality: 'Tampa',
    addressRegion: 'FL',
    postalCode: '33619',
    addressCountry: 'US',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'hello@labtestcompare.com',
    url: `${BASE_URL}/contact`,
  },
  publishingPrinciples: `${BASE_URL}/editorial-policy`,
};

const webSiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${BASE_URL}/#website`,
  url: BASE_URL,
  name: 'LabTestCompare',
  publisher: { '@id': `${BASE_URL}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${BASE_URL}/search?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
};

export const metadata: Metadata = {
  // Absolute base for OG/canonical URLs; also lets the generated opengraph-image resolve.
  metadataBase: new URL(BASE_URL),
  // Root canonical. Every public route overrides this with its own path (see each generateMetadata);
  // without one, query-string variants (utm_*, ref) are all indexable as separate URLs.
  alternates: { canonical: '/' },
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
      <head>
        {/* GA4's script is third-party and render-blocking; warming the connection early shaves the
            handshake off its cost. Harmless when the measurement id is unset and nothing loads. */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        {/* Points AI crawlers at the plain-prose description of the site (app/llms.txt/route.ts).
            There's no registered rel for this yet; the alternate/markdown pairing is the convention
            in use, and it makes the file discoverable rather than only guessable. */}
        <link rel="alternate" type="text/markdown" href="/llms.txt" title="llms.txt" />
      </head>
      <body
        className={`${dmSans.className} ${poppins.variable} min-h-screen antialiased`}
        style={{ background: 'oklch(0.985 0.005 260)' }}
      >
        {/* Keyboard users otherwise land on the nav on every page. */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {/* JSON.stringify doesn't escape "<" — escaping it keeps a stray "</script>" in any future
            copy from breaking out of this tag. < is valid inside a JSON string and parses the same. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd).replace(/</g, '\\u003c') }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteLd).replace(/</g, '\\u003c') }}
        />
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
