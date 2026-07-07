// Liveness probe for Railway's deploy healthcheck, Cloudflare, and uptime monitors. It returns 200 as
// long as the app process is up and serving — that's what the deploy gate should check. Database
// reachability is reported in the body (`checks.database`) but does NOT fail the HTTP status, so the
// service can deploy green before Postgres is attached (and a transient DB blip doesn't kill the
// deployment). Not auth-gated; leaks nothing beyond up/down.
import { NextResponse } from 'next/server';
import { prisma } from '@labprice/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  let database: 'up' | 'down' = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }

  return NextResponse.json({ status: 'ok', checks: { database }, timestamp: new Date().toISOString() });
}
