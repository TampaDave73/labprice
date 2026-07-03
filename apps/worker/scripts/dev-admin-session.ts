// Dev helper: create a DB session for the seed admin so a browser (or the preview tools) can set the
// authjs.session-token cookie directly — no email/magic-link provider is configured locally, so this
// is the fastest way to get an authenticated admin session while verifying a change.
// Run (from apps/worker):  DOTENV_CONFIG_PATH=../../.env npx tsx scripts/dev-admin-session.ts
// Then in the browser: document.cookie = "authjs.session-token=<printed token>; path=/"
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma } from '@labprice/database';

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@labprice.com' } });
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { sessionToken, userId: admin.id, expires } });
  console.log(sessionToken);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
