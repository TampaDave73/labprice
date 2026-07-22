// Shared chrome for simple prose pages (About, Terms, Privacy, Disclaimer) — Navbar/Footer + a
// centered content column with consistent typography, so each page only supplies its own copy.
import Navbar from './Navbar';
import Footer from './Footer';

export default function StaticPageLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.985 0.005 260)' }}>
      <Navbar />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.6px', color: 'oklch(0.2 0.04 260)', marginBottom: updated ? 6 : 28 }}>
          {title}
        </h1>
        {updated && (
          <p style={{ fontSize: 13, color: 'oklch(0.55 0.04 260)', marginBottom: 28 }}>Last updated {updated}</p>
        )}
        <div style={{ fontSize: 15, lineHeight: 1.7, color: 'oklch(0.3 0.03 260)' }}>{children}</div>
      </div>
      <Footer />
    </div>
  );
}
