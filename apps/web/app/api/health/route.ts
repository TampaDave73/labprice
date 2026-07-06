// Liveness/readiness probe for Railway's healthcheck, Cloudflare, and external uptime monitors.
// Verifies the database is reachable (the one hard dependency for serving anything). Returns 200 when
// healthy, 503 when the DB is unreachable — so a bad deploy fails its healthcheck instead of serving
// errors. Not auth-gated (monitors are anonymous); leaks nothing beyond up/down.
import { NextResponse } from 'next/server';
import { prisma } from '@labprice/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, 'up' | 'down'> = { database: 'up' };
  let ok = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    checks.database = 'down';
    ok = false;
  }

  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
