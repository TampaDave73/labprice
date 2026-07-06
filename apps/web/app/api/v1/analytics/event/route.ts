import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logPageView, logSearch } from '@/lib/services/analytics-service';
import { getClientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';

const eventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pageview'),
    data: z.object({
      path: z.string().max(500),
      testId: z.string().optional(),
      sessionId: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('search'),
    data: z.object({
      query: z.string().max(200),
      resultsCount: z.number().int().min(0),
      sessionId: z.string().optional(),
    }),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    // Generous floodgate: pageview/search fire on real navigation + debounced typing, so the ceiling
    // is high — it exists to stop a script from filling SearchLog/PageView, not to limit real users.
    const rl = rateLimit(getClientIp(req), 'analytics', { limit: 120, windowMs: 60 * 1000 });
    if (!rl.ok) {
      const { body: errBody, retryAfterSec } = tooManyRequests(rl.retryAfterSec);
      return NextResponse.json(errBody, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } });
    }

    const body = await req.json();
    const parsed = eventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid event payload', details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const event = parsed.data;

    if (event.type === 'pageview') {
      logPageView(event.data);
    } else {
      logSearch(event.data);
    }

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error('[POST /api/v1/analytics/event]', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
