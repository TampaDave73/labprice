// Public "Report an error" form on the test detail page — visitor flags a wrong price, dead order
// link, wrong code, etc. Lands in ResultErrorReport (reviewed at /admin/suggestions) and emails the
// admins; never mutates prices or offerings itself.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@labprice/database';
import { auth } from '@/lib/auth';
import { notifyResultErrorReport } from '@/lib/services/notify-service';
import { getClientIp, isHoneypotTripped, rateLimit, tooManyRequests } from '@/lib/rate-limit';

const schema = z.object({
  testId: z.string().min(1).max(50),
  // '' = "General / not about one vendor" option in the form's select.
  offeringId: z.string().max(50).optional().or(z.literal('')),
  message: z.string().trim().min(5, 'Tell us a bit more about the problem').max(2000),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
});

export async function POST(req: NextRequest) {
  try {
    // Malformed JSON is a client error (400 via safeParse), not a 500.
    const body: unknown = await req.json().catch(() => null);

    // Honeypot: naive bots fill the hidden `company` field. Fake a success so they don't retry.
    if (isHoneypotTripped(body)) return NextResponse.json({ data: { ok: true } });

    // Abuse guard: unauthenticated endpoint that fans out to an admin email.
    const rl = rateLimit(getClientIp(req), 'report-error', { limit: 8, windowMs: 10 * 60 * 1000 });
    if (!rl.ok) {
      const { body: errBody, retryAfterSec } = tooManyRequests(rl.retryAfterSec);
      return NextResponse.json(errBody, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid submission', details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { testId, offeringId, message, email } = parsed.data;

    // Resolve test + (optional) offering up front: a bad id is a 400, not an FK 500, and the names
    // are needed for the admin email anyway. The offering must belong to the reported test.
    const test = await prisma.test.findUnique({ where: { id: testId, deletedAt: null }, select: { id: true, name: true } });
    if (!test) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Unknown test' } }, { status: 400 });
    }
    let vendorName: string | null = null;
    if (offeringId) {
      const offering = await prisma.offering.findUnique({
        where: { id: offeringId },
        select: { testId: true, vendor: { select: { name: true } } },
      });
      if (!offering || offering.testId !== testId) {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Unknown vendor for this test' } }, { status: 400 });
      }
      vendorName = offering.vendor.name;
    }

    const session = await auth();
    await prisma.resultErrorReport.create({
      data: {
        testId,
        offeringId: offeringId || null,
        message,
        email: email || null,
        userId: session?.user?.id ?? null,
      },
    });
    notifyResultErrorReport({ testName: test.name, vendorName, message, email });

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error('[POST /api/v1/reports/result-error]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
