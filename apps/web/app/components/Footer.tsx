import SuggestionForms from './SuggestionForms';
import Logo from './Logo';

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
    <footer style={{ background: '#0f2647', padding: '40px 0 0', marginTop: 'auto' }}>
      <SuggestionForms />
      {/* Text lightness deliberately high (0.78+) — the old 0.5-0.65 grays failed contrast on this
          dark navy and the user reported the footer as hard to read. */}
      <div style={{ borderTop: '1px solid oklch(0.34 0.06 260)', padding: '24px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <Logo variant="dark" iconSize={28} wordmarkSize={15} />
            <p style={{ fontSize: 13, color: 'oklch(0.85 0.03 260)', lineHeight: 1.55, margin: '8px 0 0' }}>
              Compare blood test ordering prices. Blood drawn at Quest or LabCorp patient service centers.
            </p>
            {/* A verifiable postal address and a working email are among the strongest trust signals
                a YMYL site can carry, and both were missing entirely. Marked up with schema.org
                microdata so the address is machine-readable as well as visible. */}
            <address
              itemScope
              itemType="https://schema.org/Organization"
              style={{ fontSize: 12.5, color: 'oklch(0.82 0.03 260)', lineHeight: 1.6, margin: '10px 0 0', fontStyle: 'normal' }}
            >
              <span itemProp="name">LabTestCompare</span>
              <br />
              <span itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
                <span itemProp="streetAddress">217 Hobbs St #107</span>,{' '}
                <span itemProp="addressLocality">Tampa</span>,{' '}
                <span itemProp="addressRegion">FL</span> <span itemProp="postalCode">33619</span>
              </span>
              <br />
              <a href="mailto:hello@labtestcompare.com" itemProp="email" style={{ color: 'oklch(0.86 0.05 260)' }}>
                hello@labtestcompare.com
              </a>
            </address>
          </div>
          <p style={{ fontSize: 12, color: 'oklch(0.78 0.03 260)', textAlign: 'right', lineHeight: 1.55, margin: 0 }}>
            Prices for informational purposes only.
            <br />
            &copy; {new Date().getFullYear()} LabTestCompare. Not medical advice.
          </p>
        </div>
        <div
          style={{
            maxWidth: 1240,
            margin: '18px auto 0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 20px',
            borderTop: '1px solid oklch(0.34 0.06 260)',
            paddingTop: 16,
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
