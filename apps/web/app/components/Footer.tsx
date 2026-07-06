import SuggestionForms from './SuggestionForms';

const LINKS = [
  { href: '/order-services', label: 'List of Lab Providers' },
  { href: '/about', label: 'About' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/disclaimer', label: 'Medical Disclaimer' },
];

export default function Footer() {
  return (
    <footer style={{ background: 'oklch(0.23 0.068 230)', padding: '40px 0 0', marginTop: 'auto' }}>
      <SuggestionForms />
      {/* Text lightness deliberately high (0.78+) — the old 0.5-0.65 grays failed contrast on this
          dark navy and the user reported the footer as hard to read. */}
      <div style={{ borderTop: '1px solid oklch(0.34 0.06 230)', padding: '24px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>LabTestCompare</div>
            <p style={{ fontSize: 13, color: 'oklch(0.85 0.03 230)', lineHeight: 1.55, margin: 0 }}>
              Compare blood test ordering prices. Blood drawn at Quest or LabCorp patient service centers.
            </p>
          </div>
          <p style={{ fontSize: 12, color: 'oklch(0.78 0.03 230)', textAlign: 'right', lineHeight: 1.55, margin: 0 }}>
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
            borderTop: '1px solid oklch(0.34 0.06 230)',
            paddingTop: 16,
          }}
        >
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{ fontSize: 12, color: 'oklch(0.82 0.04 230)', textDecoration: 'none' }}
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
