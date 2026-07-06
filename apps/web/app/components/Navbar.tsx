// Top navigation. Server component so it can read the session directly (`auth()`) and render the
// real signed-in / signed-out state — the old hardcoded "Free Account" pill was a dead <div>.
// Signed out → "Sign in" link. Signed in → Admin link (admins only) + "Sign out" (server action).
import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';

const linkStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'oklch(0.35 0.05 230)',
  marginRight: 24,
  textDecoration: 'none',
};

const pillStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: 'linear-gradient(135deg, oklch(0.58 0.136 230), oklch(0.49 0.14 232))',
  color: '#fff',
  borderRadius: 20,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
  border: 'none',
  cursor: 'pointer',
};

export default async function Navbar() {
  const session = await auth();
  const user = session?.user ?? null;
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

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
        <Link href="/order-services" className="no-underline" style={linkStyle}>
          Order Services
        </Link>

        {isAdmin && (
          <Link href="/admin" className="no-underline" style={linkStyle}>
            Admin
          </Link>
        )}

        {user ? (
          // Signed in: show identity + a real sign-out (server action → clears the DB session cookie).
          <div className="flex items-center" style={{ gap: 14 }}>
            <span
              style={{ fontSize: 13, fontWeight: 500, color: 'oklch(0.45 0.04 230)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={user.email ?? undefined}
            >
              {user.name || user.email}
            </span>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            >
              <button type="submit" style={pillStyle}>
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link href="/auth/signin" className="no-underline" style={pillStyle}>
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
