// Site footer. Deliberately compact: it used to open with a repeat of the logo and run to ~40px of
// padding on every side, which is a lot of vertical space spent on a wordmark the visitor has
// already passed once in the header. What stays is what earns its place — the trust signals (postal
// address, email, disclaimers) and the link list.
import SuggestionForms from './SuggestionForms';

const LINKS = [
  { href: '/order-services', label: 'List of Lab Providers' },
  { href: '/blog', label: 'Guides' },
  { href: '/contact', label: 'Contact' },
  { href: '/editorial-policy', label: 'Editorial Policy' },
  { href: '/about', label: 'About' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/disclaimer', label: 'Medical Disclaimer' },
];

export default function Footer() {
  return (
    <footer style={{ background: '#0f2647', padding: '24px 0 0', marginTop: 'auto' }}>
      <SuggestionForms />
      {/* Text lightness deliberately high (0.78+) — the old 0.5-0.65 grays failed contrast on this
          dark navy and the user reported the footer as hard to read. */}
      <div style={{ borderTop: '1px solid oklch(0.34 0.06 260)', padding: '18px 24px 22px' }}>
        <div
          style={{
            maxWidth: 1240,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px 32px',
          }}
        >
          {/* A verifiable postal address and a working email are among the strongest trust signals
              a YMYL site can carry. Marked up with schema.org microdata so the address is
              machine-readable as well as visible. */}
          <address
            itemScope
            itemType="https://schema.org/Organization"
            style={{ fontSize: 12.5, color: 'oklch(0.85 0.03 260)', lineHeight: 1.6, margin: 0, fontStyle: 'normal' }}
          >
            <strong itemProp="name" style={{ fontWeight: 600, color: 'oklch(0.92 0.02 260)' }}>
              LabTestCompare
            </strong>
            {' · '}
            <span itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
              <span itemProp="streetAddress">217 Hobbs St #107</span>,{' '}
              <span itemProp="addressLocality">Tampa</span>,{' '}
              <span itemProp="addressRegion">FL</span> <span itemProp="postalCode">33619</span>
            </span>
            {' · '}
            <a href="mailto:hello@labtestcompare.com" itemProp="email" style={{ color: 'oklch(0.86 0.05 260)' }}>
              hello@labtestcompare.com
            </a>
          </address>
          <p style={{ fontSize: 12.5, color: 'oklch(0.8 0.03 260)', lineHeight: 1.6, margin: 0 }}>
            Blood drawn at Quest or LabCorp patient service centers. Prices are informational only and
            not medical advice. &copy; {new Date().getFullYear()} LabTestCompare.
          </p>
        </div>
        <div
          style={{
            maxWidth: 1240,
            margin: '14px auto 0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 18px',
            borderTop: '1px solid oklch(0.34 0.06 260)',
            paddingTop: 12,
          }}
        >
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{ fontSize: 12, color: 'oklch(0.82 0.04 260)', textDecoration: 'none' }}
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
