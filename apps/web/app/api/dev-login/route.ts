// DEV-ONLY sign-in shortcut. The email (Resend) and Google providers need credentials that aren't
// configured locally (RESEND_API_KEY / GOOGLE_CLIENT_* are empty in .env), so there's no way to log
// in on a dev box. This creates a database session for an existing user directly — the same thing the
// Prisma adapter does after a real magic-link/OAuth login — and sets the session cookie.
//
// Hard-gated to non-production: returns 404 when NODE_ENV === 'production' (which `next build`/`start`
// set), so it can never become an auth bypass in a real deploy. It also only logs in users that
// already exist; it never creates accounts.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { prisma } from '@labprice/database';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const email = String(form?.get('email') ?? '').trim();
  const signinUrl = new URL('/auth/signin', req.url);

  if (!email) {
    signinUrl.searchParams.set('devError', 'Enter an email.');
    return NextResponse.redirect(signinUrl, 303);
  }

  // `email` is citext in the DB, so this match is case-insensitive. Only existing (non-deleted) users.
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true } });
  if (!user) {
    signinUrl.searchParams.set('devError', `No user with email ${email}. Create the account first.`);
    return NextResponse.redirect(signinUrl, 303);
  }

  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  const res = NextResponse.redirect(new URL('/', req.url), 303);
  // Dev cookie name is the unprefixed one (prod over https would be __Secure-authjs.session-token).
  res.cookies.set('authjs.session-token', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires,
  });
  return res;
}
