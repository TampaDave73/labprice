import Link from 'next/link';
import Navbar from './components/Navbar';
import Footer from './components/Footer';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'oklch(0.985 0.005 230)' }}>
      <Navbar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <h1
            style={{ fontSize: 72, fontWeight: 700, lineHeight: 1, marginBottom: 8, color: 'oklch(0.85 0.06 230)' }}
          >
            404
          </h1>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'oklch(0.18 0.04 230)', marginBottom: 12 }}>
            Page not found
          </h2>
          <p style={{ color: 'oklch(0.5 0.04 230)', marginBottom: 32, lineHeight: 1.6 }}>
            The page you are looking for does not exist or may have been moved.
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
              background: 'oklch(0.49 0.14 232)',
            }}
          >
            Back to home
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
