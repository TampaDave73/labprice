'use server';

// Server action for signing out from the client-side NavAuth menu. Kept in its own file so the
// (static) Navbar and the client NavAuth can both stay off the `auth()` path — see NavAuth for why.
import { signOut } from '@/lib/auth';

export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}
