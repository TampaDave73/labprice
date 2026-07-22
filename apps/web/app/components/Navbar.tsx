// Top navigation. Static server component (no `auth()`) so every page that renders it stays
// statically renderable / ISR-cacheable. The signed-in/out state is rendered by <NavAuth/>, a client
// component that reads the session after hydration — see NavAuth for the why. The old hardcoded
// "Free Account" pill (a dead <div>) has been replaced by that real auth menu.
import Link from 'next/link';
import NavAuth from './NavAuth';
import Logo from './Logo';

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
        <Link href="/" className="flex items-center no-underline" style={{ flexShrink: 0 }}>
          <Logo variant="light" iconSize={32} wordmarkSize={18} />
        </Link>
        <div className="flex-1" />
        <NavAuth />
      </div>
    </nav>
  );
}
