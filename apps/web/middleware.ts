import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Content-Security-Policy. Pragmatic, not locked-down: this app renders inline styles on every public
// page (Tailwind-v4 arbitrary-value gotcha — see CLAUDE.md) and Next's App Router injects inline
// hydration scripts, so `style-src`/`script-src` must allow 'unsafe-inline'. The value here is in the
// other directives — framing, base-uri, plugins, and form targets are all locked down. Dev adds
// 'unsafe-eval' + ws: for Turbopack/React-refresh, which production omits.
function contentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Content-Security-Policy', contentSecurityPolicy());

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
