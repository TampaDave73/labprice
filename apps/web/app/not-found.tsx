// The site's 404 page, served for both kinds of miss: a URL that matches no route at all, and a
// route that matched but whose row doesn't exist (a dead `/test/<slug>`), where the page calls
// `notFound()`.
//
// Two things worth knowing about the second kind:
//   1. It only returns a real 404 status because no ancestor segment has a `loading.tsx`. A loading
//      boundary flushes the response shell before the page renders, and the status is committed by
//      then — see app/search/loading.tsx for the full note.
//   2. Next renders this component through a CLIENT not-found boundary, so for a `notFound()` miss
//      the markup below arrives in the RSC payload and is painted on hydration rather than being
//      server-rendered into the HTML. The status code is correct either way, which is what governs
//      indexing; a person with JS sees this page. Nothing in the app can change that today.
//
// It offers somewhere to go rather than just apologizing: a 404 that dead-ends wastes both the
// visitor and the crawl.
import Link from 'next/link';
import Navbar from './components/Navbar';
import Footer from './components/Footer';

const NEXT_STEPS = [
  { href: '/', label: 'Browse all lab tests' },
  { href: '/blog', label: 'Read the test guides' },
  { href: '/order-services', label: 'See every ordering service' },
  { href: '/contact', label: 'Tell us what you were looking for' },
];

export const metadata = {
  title: 'Page not found',
};

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'oklch(0.985 0.005 260)' }}>
      <Navbar />
      <main id="main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
        <div style={{ textAlign: 'center', maxWidth: 460 }}>
          <h1
            style={{ fontSize: 72, fontWeight: 700, lineHeight: 1, marginBottom: 8, color: 'oklch(0.85 0.06 260)' }}
          >
            404
          </h1>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'oklch(0.18 0.04 260)', marginBottom: 12 }}>
            Page not found
          </h2>
          <p style={{ color: 'oklch(0.5 0.04 260)', marginBottom: 24, lineHeight: 1.6 }}>
            The page you are looking for does not exist or may have been moved. A test we used to
            list can disappear if every ordering service stopped selling it.
          </p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              borderRadius: 10,
              fontWeight: 600,
              color: '#fff',
              textDecoration: 'none',
              fontSize: 15,
              background: 'oklch(0.49 0.14 262)',
            }}
          >
            Back to home
          </Link>
          <ul
            style={{
              listStyle: 'none',
              margin: '28px 0 0',
              padding: 0,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '8px 18px',
            }}
          >
            {NEXT_STEPS.map((s) => (
              <li key={s.href}>
                <Link href={s.href} style={{ fontSize: 13.5, color: 'oklch(0.45 0.14 260)' }}>
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer />
    </div>
  );
}
