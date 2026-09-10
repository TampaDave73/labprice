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
    // GA4 (googletagmanager.com/google-analytics.com) is allowed unconditionally — harmless when
    // NEXT_PUBLIC_GA_MEASUREMENT_ID is unset (GoogleAnalytics.tsx renders nothing, so nothing ever
    // requests these) and saves a CSP edit whenever the env var eventually gets set.
    `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com${isDev ? " 'unsafe-eval'" : ''}`,
    `connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com${isDev ? ' ws: wss:' : ''}`,
  ].join('; ');
}

const SID_COOKIE = 'sid';

export function middleware(request: NextRequest) {
  // www -> apex, 301, preserving path and query. Every canonical, the sitemap and robots.txt all use
  // the bare apex, so a www request that served content would split the site across two hostnames.
  // Note this is inert until a www DNS record exists (there is none today — see the note in
  // docs/08-deployment.md); it is here so that adding one can't accidentally create a duplicate site.
  const host = request.headers.get('host') ?? '';
  if (host.startsWith('www.')) {
    const url = request.nextUrl.clone();
    url.host = host.slice(4);
    url.protocol = 'https';
    url.port = '';
    return NextResponse.redirect(url, 301);
  }

  const response = NextResponse.next();

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Content-Security-Policy', contentSecurityPolicy());
  // Locks the site to HTTPS for two years once a browser has seen this header. Production only —
  // sending it in dev would pin localhost to HTTPS in your browser and break `pnpm dev`.
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  // Nothing here uses these APIs; denying them explicitly stops an embedded third party asking.
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()',
  );

  // Anonymous session id for internal analytics ("unique visitors", not auth) — set here (not
  // client-side) so it's a plain cookie the browser sends on every request automatically, including
  // the `/api/v1/go/[id]` affiliate redirect (a top-level navigation, not a fetch a client script
  // could attach a header to). httpOnly since no client JS needs to read it.
  if (!request.cookies.get(SID_COOKIE)) {
    response.cookies.set(SID_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 180,
      path: '/',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
