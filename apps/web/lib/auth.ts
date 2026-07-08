// Auth.js (NextAuth v5) config. Database-backed sessions via the Prisma adapter (the session cookie
// value is a lookup key into the `sessions` table). Providers: Resend email magic-link + Google.
// The session callback attaches the user's `role`, which the admin layout gates on.
import NextAuth, { type NextAuthResult } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';
import { prisma } from '@labprice/database';
import type { Role } from '@labprice/database';

// Register a provider ONLY when its credentials exist. Configuring Google with an empty client id (or
// Resend with no key) makes Auth.js throw "There was a problem with the server configuration" on the
// entire /api/auth surface — which is exactly what happens in prod if only some creds are set.
const providers: Provider[] = [];

const resendKey = process.env.RESEND_API_KEY || process.env.AUTH_RESEND_KEY;
if (resendKey) {
  providers.push(
    Resend({
      apiKey: resendKey, // use the same var the app's notify-service uses, so you only set one
      from: process.env.EMAIL_FROM || 'LabTestCompare <noreply@labtestcompare.com>',
    }),
  );
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: Role;
      image: string | null;
    };
  }

  interface User {
    role?: Role;
  }
}

const nextAuth: NextAuthResult = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  // Always behind a proxy (Cloudflare → Railway). Without this, Auth.js can't verify the request host
  // when building the callback URL and throws a `Configuration`/`UntrustedHost` error on the magic-link
  // callback. Setting it in code means it doesn't depend on the AUTH_TRUST_HOST env var being present.
  trustHost: true,
  providers,
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify',
  },
  callbacks: {
    // Sign-in is invite-only: only accounts that ALREADY exist (and aren't soft-deleted) may sign in.
    // The app has no public self-service accounts, so this rejects a stranger's unknown email BEFORE
    // any user is created or magic-link email is sent (the check runs on the "send link" request too).
    // To grant someone access, add them from the admin Users screen first. Deleted/retired users
    // (e.g. the old seed admin) are also blocked here.
    async signIn({ user }) {
      if (!user?.email) return false;
      const existing = await prisma.user.findFirst({
        where: { email: user.email, deletedAt: null },
        select: { id: true },
      });
      return existing != null;
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as any).role ?? 'USER';
      }
      return session;
    },
  },
});

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
