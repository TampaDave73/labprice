'use client';

// Client-side auth menu for the Navbar. It fetches the session from /api/auth/session AFTER hydration
// instead of calling `auth()` on the server — deliberately. `auth()` reads cookies, which opts every
// page that renders the Navbar into dynamic rendering and would silently defeat the home page's
// `revalidate = 60` and the ISR-cacheable test pages. Reading the session client-side keeps the
// surrounding pages static/ISR while still showing real signed-in state (with a brief placeholder).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signOutAction } from '../actions/auth-actions';

interface SessionUser {
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

const linkStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'oklch(0.35 0.05 260)',
  marginRight: 24,
  textDecoration: 'none',
};

const pillStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: 'linear-gradient(135deg, oklch(0.58 0.136 260), oklch(0.49 0.14 262))',
  color: '#fff',
  borderRadius: 20,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
  border: 'none',
  cursor: 'pointer',
};

export default function NavAuth() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (active) setUser(j?.user ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Default (and SSR) state is the "Sign in" control — a functional link even if the session fetch
  // is slow or fails, so the navbar never shows a dead/empty box. Once the session resolves for a
  // signed-in user it swaps to their name + Sign out (a brief, standard client-auth flash).
  if (!user) {
    return (
      <Link href="/auth/signin" className="no-underline" style={pillStyle}>
        Sign in
      </Link>
    );
  }

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  return (
    <div className="flex items-center" style={{ gap: 14 }}>
      {isAdmin && (
        <Link href="/admin" className="no-underline" style={linkStyle}>
          Admin
        </Link>
      )}
      <span
        style={{ fontSize: 13, fontWeight: 500, color: 'oklch(0.45 0.04 260)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={user.email ?? undefined}
      >
        {user.name || user.email}
      </span>
      <form action={signOutAction}>
        <button type="submit" style={pillStyle}>
          Sign out
        </button>
      </form>
    </div>
  );
}
