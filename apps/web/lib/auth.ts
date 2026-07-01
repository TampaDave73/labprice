// Auth.js (NextAuth v5) config. Database-backed sessions via the Prisma adapter (the session cookie
// value is a lookup key into the `sessions` table). Providers: Resend email magic-link + Google.
// The session callback attaches the user's `role`, which the admin layout gates on.
import NextAuth, { type NextAuthResult } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';
import { prisma } from '@labprice/database';
import type { Role } from '@labprice/database';

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
  providers: [
    Resend({
      from: process.env.EMAIL_FROM || 'LabTestCompare <noreply@labtestcompare.com>',
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify',
  },
  callbacks: {
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
