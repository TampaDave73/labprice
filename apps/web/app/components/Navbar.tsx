// Top navigation. Static server component (no `auth()`) so every page that renders it stays
// statically renderable / ISR-cacheable. The signed-in/out state is rendered by <NavAuth/>, a client
// component that reads the session after hydration — see NavAuth for the why. The old hardcoded
// "Free Account" pill (a dead <div>) has been replaced by that real auth menu.
import Link from 'next/link';
import NavAuth from './NavAuth';

export default function Navbar() {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 200,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        background: 'rgba(255,255,255,0.96)',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
      }}
    >
      <div
        className="flex items-center mx-auto"
        style={{ maxWidth: 1240, padding: '0 24px', height: 64 }}
      >
        <Link href="/" className="flex items-center no-underline" style={{ gap: 10, flexShrink: 0 }}>
          <div
            className="flex items-center justify-center"
            style={{
              width: 34,
              height: 34,
              background: 'linear-gradient(135deg, oklch(0.58 0.136 230), oklch(0.49 0.14 232))',
              borderRadius: 9,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="3" fill="white" />
              <line x1="9" y1="2" x2="9" y2="5" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="9" y1="13" x2="9" y2="16" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="2" y1="9" x2="5" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="13" y1="9" x2="16" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '-0.3px',
              color: 'oklch(0.18 0.04 230)',
            }}
          >
            LabTestCompare
          </span>
        </Link>
        <div className="flex-1" />
        <NavAuth />
      </div>
    </nav>
  );
}
